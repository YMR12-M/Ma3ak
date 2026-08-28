const express = require('express');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const { canAccessPatient } = require('../utils/access');
const { generateDosesForMedication, cleanupStaleDoses } = require('../scheduler');
const { cairoToday } = require('../utils/time');
const {
  LIMITS,
  isNonEmptyString,
  isTooLong,
  isValidDate,
  validateTimes,
  parseDaysOfWeek,
  parsePillsLeft,
} = require('../utils/validate');

const router = express.Router();

/* ---------------------------------------------------------------------------
   صورة الدوا

   كبار السن بيعرفوا الدوا بشكله ولونه، مش باسمه العلمي. "كونكور 5" مش معلومة
   بالنسبة لحد بيبص على 6 علب متشابهة؛ صورة الشريط معلومة. دي غالبًا أكتر
   إضافة بتقلل أخطاء أخد الدوا الحقيقية.

   الصورة بتتبعت base64 وبتتخزن في جدول منفصل (شوف sql/schema.sql). الواجهة
   بتصغّرها قبل الرفع، والحد هنا خط الدفاع الأخير مش الأول.
   --------------------------------------------------------------------------- */

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
// ~300 كيلوبايت بعد base64. الواجهة بتنزّل الصورة لـ 640px/JPEG قبل ما تبعت،
// فالحد ده واسع جدًا للاستخدام العادي وبيمسك الحالات الشاذة بس.
const MAX_IMAGE_BASE64_LENGTH = 400 * 1024;

async function assertMedicationAccess(req, res, medicationId) {
  const [rows] = await pool.query('SELECT id, patient_id FROM medications WHERE id = ?', [medicationId]);
  if (!rows.length) {
    res.status(404).json({ error: 'الدواء مش موجود' });
    return null;
  }
  if (!(await canAccessPatient(req.user, rows[0].patient_id))) {
    res.status(403).json({ error: 'مفيش صلاحية' });
    return null;
  }
  return rows[0];
}

/* بيرجّع الصورة كـ data URL جوه JSON مش كملف ثنائي.

   السبب: وسم <img src="..."> **مش بيقدر يبعت هيدر Authorization**، والمسار ده
   لازم يفضل محمي زي أي بيانات مريض تانية. البديل (توكن في الرابط) بيحط التوكن
   في سجلات السيرفر وفي تاريخ المتصفح. الواجهة بتكاش الناتج عندها (شوف
   js/medImages.js) فالطلب بيحصل مرة واحدة لكل دواء. */
router.get(
  '/:id/image',
  authRequired,
  asyncHandler(async (req, res) => {
    if (!(await assertMedicationAccess(req, res, req.params.id))) return;
    const [rows] = await pool.query('SELECT mime, data FROM medication_images WHERE medication_id = ?', [
      req.params.id,
    ]);
    if (!rows.length) return res.status(404).json({ error: 'مفيش صورة للدواء ده' });
    res.json({ dataUrl: `data:${rows[0].mime};base64,${rows[0].data}` });
  })
);

router.put(
  '/:id/image',
  authRequired,
  // حد أكبر من الافتراضي (100kb في server.js) للمسار ده وحده - الصور أكبر من
  // أي جسم طلب تاني في التطبيق، والحد العام لازم يفضل ضيق لباقي المسارات
  express.json({ limit: '600kb' }),
  asyncHandler(async (req, res) => {
    if (!(await assertMedicationAccess(req, res, req.params.id))) return;

    const { data, mime } = req.body || {};
    if (!ALLOWED_IMAGE_MIMES.includes(mime)) {
      return res.status(400).json({ error: 'نوع الصورة ده مش مدعوم (JPEG أو PNG أو WebP بس)' });
    }
    if (typeof data !== 'string' || !data.length) {
      return res.status(400).json({ error: 'الصورة مش مبعوتة صح' });
    }
    if (data.length > MAX_IMAGE_BASE64_LENGTH) {
      return res.status(413).json({ error: 'الصورة كبيرة أوي - جرّب صورة أصغر' });
    }
    // base64 سليم فعلاً - من غير الفحص ده ممكن يتخزن نص أي حاجة ويطلع صورة مكسورة
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
      return res.status(400).json({ error: 'الصورة مش مبعوتة صح' });
    }

    await pool.query(
      `INSERT INTO medication_images (medication_id, mime, data) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE mime = VALUES(mime), data = VALUES(data)`,
      [req.params.id, mime, data]
    );
    await pool.query('UPDATE medications SET has_image = 1 WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  })
);

router.delete(
  '/:id/image',
  authRequired,
  asyncHandler(async (req, res) => {
    if (!(await assertMedicationAccess(req, res, req.params.id))) return;
    await pool.query('DELETE FROM medication_images WHERE medication_id = ?', [req.params.id]);
    await pool.query('UPDATE medications SET has_image = 0 WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  })
);

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
      /* الأعمدة الزيادة (الغفوة + خصايص الدواء) مش رفاهية: شاشة المنبه عند
         المريض بتقرر منها تعرض زرار "فكّرني بعدين" ولا لأ، وكام غفوة فاضلة -
         ولازم تطلع نفس نتيجة السيرفر بالظبط (canSnoozeDose في doseLogic.js).

         و m.notes كانت **ناقصة** هنا: المتابع بيكتب تعليمات الدكتور ("خده بعد
         الأكل بساعة"، "متاخدهوش مع اللبن") وبتتخزن وبتبان في شاشته - والمريض
         عمره ما شافها. في تطبيق دوا دي معلومة طبية كانت بتضيع في السكة. */
      `SELECT d.id, d.scheduled_at, d.status, d.taken_at,
              d.snooze_until, d.snooze_count, d.due_notified_at,
              m.id AS medication_id, m.name, m.dosage, m.notes, m.has_image,
              m.is_critical, m.snooze_allowed
     FROM doses d
     JOIN medications m ON m.id = d.medication_id
     WHERE d.patient_id = ? AND DATE(d.scheduled_at) = ?
       -- الدواء الموقوف مبيبانش في شاشة المريض. من غير الشرط ده كان المريض
       -- بيشوف جرعة لدوا المتابع وقّفه، وياخده لأن التطبيق عرضها له.
       AND m.active = 1
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
    const {
      patientId,
      name,
      dosage,
      notes,
      times,
      startDate,
      endDate,
      isCritical,
      snoozeAllowed,
      daysOfWeek,
      pillsLeft,
    } = req.body;
    if (!patientId) return res.status(400).json({ error: 'لازم تحدد المريض' });

    const error = validateMedicationInput({ name, dosage, notes, times, startDate, endDate });
    if (error) return res.status(400).json({ error });

    const days = parseDaysOfWeek(daysOfWeek);
    if (days.error) return res.status(400).json({ error: days.error });
    const stock = parsePillsLeft(pillsLeft);
    if (stock.error) return res.status(400).json({ error: stock.error });

    if (!(await canAccessPatient(req.user, patientId))) {
      return res.status(403).json({ error: 'مفيش صلاحية' });
    }
    const [result] = await pool.query(
      `INSERT INTO medications
         (patient_id, name, dosage, notes, times, days_of_week, pills_left,
          start_date, end_date, is_critical, snooze_allowed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        patientId,
        name.trim(),
        dosage || null,
        notes || null,
        JSON.stringify(times),
        days.mask,
        stock.pills,
        startDate,
        endDate || null,
        isCritical ? 1 : 0,
        // دواء حرج مبيقبلش غفوة أصلاً، فبنخزّنها 0 من الأول بدل ما نعتمد على
        // إن كل مكان بيقرا العمودين يفتكر يجمعهم صح
        isCritical ? 0 : snoozeAllowed === false ? 0 : 1,
      ]
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

    const {
      name,
      dosage,
      notes,
      times,
      startDate,
      endDate,
      active,
      isCritical,
      snoozeAllowed,
      daysOfWeek,
      pillsLeft,
    } = req.body;

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

    const nextCritical = isCritical === undefined ? med.is_critical : isCritical ? 1 : 0;
    const nextSnoozeAllowed = nextCritical
      ? 0
      : snoozeAllowed === undefined
        ? med.snooze_allowed
        : snoozeAllowed
          ? 1
          : 0;

    const error = validateMedicationInput(merged);
    if (error) return res.status(400).json({ error });

    const days = daysOfWeek === undefined ? { mask: med.days_of_week } : parseDaysOfWeek(daysOfWeek);
    if (days.error) return res.status(400).json({ error: days.error });

    const stock = pillsLeft === undefined ? { pills: med.pills_left } : parsePillsLeft(pillsLeft);
    if (stock.error) return res.status(400).json({ error: stock.error });

    /* المتابع جاب عبوة جديدة (الكمية زادت) → نصفّي طابع تنبيه "قرب يخلص"،
       عشان التنبيه الجاي يشتغل تاني لما العبوة الجديدة تقرب تخلص هي كمان.
       من غير التصفية دي التنبيه بيتبعت مرة واحدة في عمر الدواء وخلاص. */
    const refilled =
      stock.pills !== null && (med.pills_left === null || stock.pills > med.pills_left);

    /* لازم JSON.stringify هنا حتى لو الـ times جاية من قاعدة البيانات نفسها:
       mysql2 بيرجع أعمدة JSON كـ array جاهز، ولو رجّعناه كباراميتر زي ما هو
       بيفرده لقيم مفصولة بفاصلة ('09:00') - نص مش JSON صالح، وقاعدة البيانات
       بترفضه. ده كان بيوقّع السيرفر بالكامل مع أي تعديل من غير ما يبعت times. */
    await pool.query(
      `UPDATE medications
     SET name = ?, dosage = ?, notes = ?, times = ?, days_of_week = ?, pills_left = ?,
         low_stock_notified_at = ?, start_date = ?, end_date = ?, active = ?,
         is_critical = ?, snooze_allowed = ?
     WHERE id = ?`,
      [
        merged.name.trim(),
        merged.dosage,
        merged.notes,
        JSON.stringify(merged.times),
        days.mask,
        stock.pills,
        refilled ? null : med.low_stock_notified_at,
        merged.startDate,
        merged.endDate || null,
        active === undefined ? med.active : active ? 1 : 0,
        nextCritical,
        nextSnoozeAllowed,
        req.params.id,
      ]
    );

    const [updatedRows] = await pool.query('SELECT * FROM medications WHERE id = ?', [req.params.id]);
    if (updatedRows.length) {
      /* الترتيب مهم: بننضّف الأول وبعدين نولّد.

         من غير التنضيف، تغيير ميعاد جرعة من 8 لـ 9 كان بيضيف صف الميعاد الجديد
         وبيسيب القديم pending - فالمريض يترنّ عليه مرتين، والجرعة القديمة تتحسب
         فايتة على دوا مواعيده اتغيّرت أصلاً. */
      await cleanupStaleDoses(updatedRows[0]).catch((e) =>
        console.error('cleanupStaleDoses (update) error:', e.message)
      );
      if (updatedRows[0].active) {
        await generateDosesForMedication(updatedRows[0]).catch((e) =>
          console.error('generateDosesForMedication (update) error:', e.message)
        );
      }
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

    /* إيقاف الدواء لازم يشيل جرعاته الجاية كمان. من غير السطر ده كان الدوا
       "يتوقف" في شاشة المتابع بينما المنبه يفضل يرنّ على المريض في مواعيده،
       والمتابع ياخد "جرعة فاتت" لدوا هو نفسه وقّفه.
       الجرعات اللي فات ميعادها بتفضل: دي تاريخ فعلي وتقرير الالتزام بيقرا منها. */
    await cleanupStaleDoses({ ...med, active: 0 }).catch((e) =>
      console.error('cleanupStaleDoses (delete) error:', e.message)
    );

    res.json({ ok: true });
  })
);

module.exports = router;
