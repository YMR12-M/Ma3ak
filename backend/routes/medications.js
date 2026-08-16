const express = require('express');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const { canAccessPatient } = require('../utils/access');
const { generateDosesForMedication } = require('../scheduler');
const { cairoToday } = require('../utils/time');
const { LIMITS, isNonEmptyString, isTooLong, isValidDate, validateTimes } = require('../utils/validate');

const router = express.Router();

router.get(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const { patientId } = req.query;
    if (!patientId) return res.status(400).json({ error: 'لازم تحدد المريض' });
    if (!(await canAccessPatient(req.user, patientId))) {
      return res.status(403).json({ error: 'مفيش صلاحية' });
    }
    const [rows] = await pool.query(
      'SELECT * FROM medications WHERE patient_id = ? AND active = 1 ORDER BY created_at DESC',
      [patientId]
    );
    res.json({ medications: rows });
  })
);

router.get(
  '/:patientId/today',
  authRequired,
  asyncHandler(async (req, res) => {
    const { patientId } = req.params;
    if (!(await canAccessPatient(req.user, patientId))) {
      return res.status(403).json({ error: 'مفيش صلاحية' });
    }
    const [rows] = await pool.query(
      `SELECT d.id, d.scheduled_at, d.status, d.taken_at, m.name, m.dosage
     FROM doses d
     JOIN medications m ON m.id = d.medication_id
     WHERE d.patient_id = ? AND DATE(d.scheduled_at) = ?
     ORDER BY d.scheduled_at ASC`,
      [patientId, cairoToday()]
    );
    res.json({ doses: rows });
  })
);

/* بيتأكد إن بيانات الدواء سليمة قبل ما تروح لقاعدة البيانات.
   بيرجع رسالة الخطأ العربية، أو null لو كله تمام. */
function validateMedicationInput({ name, dosage, notes, times, startDate, endDate }) {
  if (!isNonEmptyString(name)) return 'من فضلك اكتب اسم الدواء';
  if (isTooLong(name, LIMITS.medName)) return `اسم الدواء طويل أوي (أقصى ${LIMITS.medName} حرف)`;
  if (isTooLong(dosage, LIMITS.dosage)) return `وصف الجرعة طويل أوي (أقصى ${LIMITS.dosage} حرف)`;
  if (isTooLong(notes, LIMITS.notes)) return `الملاحظات طويلة أوي (أقصى ${LIMITS.notes} حرف)`;

  const timesError = validateTimes(times);
  if (timesError) return timesError;

  if (!isValidDate(startDate)) return 'تاريخ البداية مش مكتوب صح';
  if (endDate != null && endDate !== '' && !isValidDate(endDate)) return 'تاريخ النهاية مش مكتوب صح';
  if (endDate && endDate < startDate) return 'تاريخ النهاية لازم يكون بعد تاريخ البداية';
  return null;
}

router.post(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const { patientId, name, dosage, notes, times, startDate, endDate } = req.body;
    if (!patientId) return res.status(400).json({ error: 'لازم تحدد المريض' });

    const error = validateMedicationInput({ name, dosage, notes, times, startDate, endDate });
    if (error) return res.status(400).json({ error });

    if (!(await canAccessPatient(req.user, patientId))) {
      return res.status(403).json({ error: 'مفيش صلاحية' });
    }
    const [result] = await pool.query(
      `INSERT INTO medications (patient_id, name, dosage, notes, times, start_date, end_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [patientId, name.trim(), dosage || null, notes || null, JSON.stringify(times), startDate, endDate || null]
    );

    // نولّد جرعات اليوم وبكرة فورًا، من غير ما نستنى دورة الـ scheduler الجاية
    const [newMedRows] = await pool.query('SELECT * FROM medications WHERE id = ?', [result.insertId]);
    if (newMedRows.length) {
      await generateDosesForMedication(newMedRows[0]).catch((e) =>
        console.error('generateDosesForMedication (create) error:', e.message)
      );
    }

    res.status(201).json({ id: result.insertId });
  })
);

router.put(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM medications WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'الدواء مش موجود' });
    const med = rows[0];
    if (!(await canAccessPatient(req.user, med.patient_id))) {
      return res.status(403).json({ error: 'مفيش صلاحية' });
    }

    const { name, dosage, notes, times, startDate, endDate, active } = req.body;

    /* بندمج المبعوت مع الموجود الأول، وبعدين نتحقق من النتيجة النهائية - عشان
       تعديل جزئي (اسم بس مثلاً) ما يعديش من غير تحقق، وفي نفس الوقت ما نطلبش من
       العميل يبعت كل الحقول كل مرة. */
    const merged = {
      name: name ?? med.name,
      dosage: dosage ?? med.dosage,
      notes: notes ?? med.notes,
      times: times ?? (typeof med.times === 'string' ? JSON.parse(med.times) : med.times),
      startDate: startDate ?? med.start_date,
      endDate: endDate === undefined ? med.end_date : endDate,
    };

    const error = validateMedicationInput(merged);
    if (error) return res.status(400).json({ error });

    /* لازم JSON.stringify هنا حتى لو الـ times جاية من قاعدة البيانات نفسها:
       mysql2 بيرجع أعمدة JSON كـ array جاهز، ولو رجّعناه كباراميتر زي ما هو
       بيفرده لقيم مفصولة بفاصلة ('09:00') - نص مش JSON صالح، وقاعدة البيانات
       بترفضه. ده كان بيوقّع السيرفر بالكامل مع أي تعديل من غير ما يبعت times. */
    await pool.query(
      `UPDATE medications
     SET name = ?, dosage = ?, notes = ?, times = ?, start_date = ?, end_date = ?, active = ?
     WHERE id = ?`,
      [
        merged.name.trim(),
        merged.dosage,
        merged.notes,
        JSON.stringify(merged.times),
        merged.startDate,
        merged.endDate || null,
        active === undefined ? med.active : active ? 1 : 0,
        req.params.id,
      ]
    );

    const [updatedRows] = await pool.query('SELECT * FROM medications WHERE id = ?', [req.params.id]);
    if (updatedRows.length && updatedRows[0].active) {
      await generateDosesForMedication(updatedRows[0]).catch((e) =>
        console.error('generateDosesForMedication (update) error:', e.message)
      );
    }

    res.json({ ok: true });
  })
);

router.delete(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM medications WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'الدواء مش موجود' });
    const med = rows[0];
    if (!(await canAccessPatient(req.user, med.patient_id))) {
      return res.status(403).json({ error: 'مفيش صلاحية' });
    }
    await pool.query('UPDATE medications SET active = 0 WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  })
);

module.exports = router;
