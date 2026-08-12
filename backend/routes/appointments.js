const express = require('express');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');
const { canAccessPatient } = require('../utils/access');

const router = express.Router();

router.get('/', authRequired, async (req, res) => {
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
});

router.post('/', authRequired, async (req, res) => {
  const { patientId, title, doctorName, location, appointmentAt, notes } = req.body;
  if (!patientId || !title || !appointmentAt) {
    return res.status(400).json({ error: 'من فضلك املأ عنوان الموعد وموعده' });
  }
  if (!(await canAccessPatient(req.user, patientId))) {
    return res.status(403).json({ error: 'مفيش صلاحية' });
  }
  const [result] = await pool.query(
    `INSERT INTO appointments (patient_id, title, doctor_name, location, appointment_at, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [patientId, title, doctorName || null, location || null, appointmentAt, notes || null]
  );
  res.status(201).json({ id: result.insertId });
});

router.put('/:id', authRequired, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM appointments WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'الموعد مش موجود' });
  const appt = rows[0];
  if (!(await canAccessPatient(req.user, appt.patient_id))) {
    return res.status(403).json({ error: 'مفيش صلاحية' });
  }
  const { title, doctorName, location, appointmentAt, notes } = req.body;
  await pool.query(
    `UPDATE appointments SET title = ?, doctor_name = ?, location = ?, appointment_at = ?, notes = ? WHERE id = ?`,
    [
      title ?? appt.title,
      doctorName ?? appt.doctor_name,
      location ?? appt.location,
      appointmentAt ?? appt.appointment_at,
      notes ?? appt.notes,
      req.params.id,
    ]
  );
  res.json({ ok: true });
});

router.delete('/:id', authRequired, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM appointments WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'الموعد مش موجود' });
  const appt = rows[0];
  if (!(await canAccessPatient(req.user, appt.patient_id))) {
    return res.status(403).json({ error: 'مفيش صلاحية' });
  }
  await pool.query('DELETE FROM appointments WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
