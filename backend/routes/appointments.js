const express = require('express');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const { canAccessPatient } = require('../utils/access');
const {
  LIMITS,
  isNonEmptyString,
  isTooLong,
  isValidDateTime,
  normalizeDateTime,
} = require('../utils/validate');

const router = express.Router();

/* بيتأكد إن بيانات الموعد سليمة. بيرجع رسالة الخطأ العربية، أو null لو كله تمام. */
function validateAppointmentInput({ title, doctorName, location, appointmentAt, notes }) {
  if (!isNonEmptyString(title)) return 'من فضلك اكتب عنوان الموعد';
  if (isTooLong(title, LIMITS.apptTitle)) return `عنوان الموعد طويل أوي (أقصى ${LIMITS.apptTitle} حرف)`;
  if (isTooLong(doctorName, LIMITS.doctorName)) return `اسم الدكتور طويل أوي (أقصى ${LIMITS.doctorName} حرف)`;
  if (isTooLong(location, LIMITS.location)) return `المكان طويل أوي (أقصى ${LIMITS.location} حرف)`;
  if (isTooLong(notes, LIMITS.notes)) return `الملاحظات طويلة أوي (أقصى ${LIMITS.notes} حرف)`;
  if (!isValidDateTime(appointmentAt)) return 'تاريخ الموعد ووقته مش مكتوبين صح';
  return null;
}

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
      'SELECT * FROM appointments WHERE patient_id = ? ORDER BY appointment_at ASC',
      [patientId]
    );
    res.json({ appointments: rows });
  })
);

router.post(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const { patientId, title, doctorName, location, appointmentAt, notes } = req.body;
    if (!patientId) return res.status(400).json({ error: 'لازم تحدد المريض' });

    const error = validateAppointmentInput({ title, doctorName, location, appointmentAt, notes });
    if (error) return res.status(400).json({ error });

    if (!(await canAccessPatient(req.user, patientId))) {
      return res.status(403).json({ error: 'مفيش صلاحية' });
    }
    const [result] = await pool.query(
      `INSERT INTO appointments (patient_id, title, doctor_name, location, appointment_at, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
      [
        patientId,
        title.trim(),
        doctorName || null,
        location || null,
        normalizeDateTime(appointmentAt),
        notes || null,
      ]
    );
    res.status(201).json({ id: result.insertId });
  })
);

router.put(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM appointments WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'الموعد مش موجود' });
    const appt = rows[0];
    if (!(await canAccessPatient(req.user, appt.patient_id))) {
      return res.status(403).json({ error: 'مفيش صلاحية' });
    }
    const { title, doctorName, location, appointmentAt, notes } = req.body;

    // بندمج المبعوت مع الموجود، وبعدين نتحقق من النتيجة - عشان التعديل الجزئي يفضل
    // مسموح من غير ما يعدي أي قيمة غلط من غير تحقق
    const merged = {
      title: title ?? appt.title,
      doctorName: doctorName ?? appt.doctor_name,
      location: location ?? appt.location,
      appointmentAt: appointmentAt ?? appt.appointment_at,
      notes: notes ?? appt.notes,
    };

    const error = validateAppointmentInput(merged);
    if (error) return res.status(400).json({ error });

    await pool.query(
      `UPDATE appointments SET title = ?, doctor_name = ?, location = ?, appointment_at = ?, notes = ? WHERE id = ?`,
      [
        merged.title.trim(),
        merged.doctorName,
        merged.location,
        normalizeDateTime(merged.appointmentAt),
        merged.notes,
        req.params.id,
      ]
    );
    res.json({ ok: true });
  })
);

router.delete(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM appointments WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'الموعد مش موجود' });
    const appt = rows[0];
    if (!(await canAccessPatient(req.user, appt.patient_id))) {
      return res.status(403).json({ error: 'مفيش صلاحية' });
    }
    await pool.query('DELETE FROM appointments WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  })
);

module.exports = router;
