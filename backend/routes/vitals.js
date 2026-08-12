const express = require('express');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');
const { canAccessPatient } = require('../utils/access');

const router = express.Router();

const ALLOWED_TYPES = ['blood_pressure', 'blood_sugar', 'weight', 'heart_rate', 'temperature'];

router.get('/', authRequired, async (req, res) => {
  const { patientId, type } = req.query;
  if (!patientId) return res.status(400).json({ error: 'لازم تحدد المريض' });
  if (!(await canAccessPatient(req.user, patientId))) {
    return res.status(403).json({ error: 'مفيش صلاحية' });
  }
  const params = [patientId];
  let sql = 'SELECT * FROM vitals WHERE patient_id = ?';
  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }
  sql += ' ORDER BY recorded_at DESC LIMIT 100';
  const [rows] = await pool.query(sql, params);
  res.json({ vitals: rows });
});

router.post('/', authRequired, async (req, res) => {
  const { patientId, type, value, recordedAt } = req.body;
  if (!patientId || !type || !value) {
    return res.status(400).json({ error: 'من فضلك املأ كل البيانات' });
  }
  if (!ALLOWED_TYPES.includes(type)) {
    return res.status(400).json({ error: 'نوع القياس غير معروف' });
  }
  if (!(await canAccessPatient(req.user, patientId))) {
    return res.status(403).json({ error: 'مفيش صلاحية' });
  }
  const [result] = await pool.query(
    'INSERT INTO vitals (patient_id, type, value_json, recorded_at) VALUES (?, ?, ?, ?)',
    [patientId, type, JSON.stringify(value), recordedAt || new Date()]
  );
  res.status(201).json({ id: result.insertId });
});

router.delete('/:id', authRequired, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM vitals WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'القياس مش موجود' });
  const vital = rows[0];
  if (!(await canAccessPatient(req.user, vital.patient_id))) {
    return res.status(403).json({ error: 'مفيش صلاحية' });
  }
  await pool.query('DELETE FROM vitals WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
