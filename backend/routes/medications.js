const express = require('express');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');
const { canAccessPatient } = require('../utils/access');
const { generateDosesForMedication } = require('../scheduler');

const router = express.Router();

router.get('/', authRequired, async (req, res) => {
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
});

router.get('/:patientId/today', authRequired, async (req, res) => {
  const { patientId } = req.params;
  if (!(await canAccessPatient(req.user, patientId))) {
    return res.status(403).json({ error: 'مفيش صلاحية' });
  }
  const [rows] = await pool.query(
    `SELECT d.id, d.scheduled_at, d.status, d.taken_at, m.name, m.dosage
     FROM doses d
     JOIN medications m ON m.id = d.medication_id
     WHERE d.patient_id = ? AND DATE(d.scheduled_at) = CURDATE()
     ORDER BY d.scheduled_at ASC`,
    [patientId]
  );
  res.json({ doses: rows });
});

router.post('/', authRequired, async (req, res) => {
  const { patientId, name, dosage, notes, times, startDate, endDate } = req.body;
  if (!patientId || !name || !Array.isArray(times) || !times.length || !startDate) {
    return res.status(400).json({ error: 'من فضلك املأ اسم الدواء والمواعيد وتاريخ البداية' });
  }
  if (!(await canAccessPatient(req.user, patientId))) {
    return res.status(403).json({ error: 'مفيش صلاحية' });
  }
  const [result] = await pool.query(
    `INSERT INTO medications (patient_id, name, dosage, notes, times, start_date, end_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [patientId, name, dosage || null, notes || null, JSON.stringify(times), startDate, endDate || null]
  );

  // نولّد جرعات اليوم وبكرة فورًا، من غير ما نستنى دورة الـ scheduler الجاية
  const [newMedRows] = await pool.query('SELECT * FROM medications WHERE id = ?', [result.insertId]);
  if (newMedRows.length) {
    await generateDosesForMedication(newMedRows[0]).catch((e) =>
      console.error('generateDosesForMedication (create) error:', e.message)
    );
  }

  res.status(201).json({ id: result.insertId });
});

router.put('/:id', authRequired, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM medications WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'الدواء مش موجود' });
  const med = rows[0];
  if (!(await canAccessPatient(req.user, med.patient_id))) {
    return res.status(403).json({ error: 'مفيش صلاحية' });
  }

  const { name, dosage, notes, times, startDate, endDate, active } = req.body;
  await pool.query(
    `UPDATE medications
     SET name = ?, dosage = ?, notes = ?, times = ?, start_date = ?, end_date = ?, active = ?
     WHERE id = ?`,
    [
      name ?? med.name,
      dosage ?? med.dosage,
      notes ?? med.notes,
      times ? JSON.stringify(times) : med.times,
      startDate ?? med.start_date,
      endDate === undefined ? med.end_date : endDate,
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
});

router.delete('/:id', authRequired, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM medications WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'الدواء مش موجود' });
  const med = rows[0];
  if (!(await canAccessPatient(req.user, med.patient_id))) {
    return res.status(403).json({ error: 'مفيش صلاحية' });
  }
  await pool.query('UPDATE medications SET active = 0 WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
