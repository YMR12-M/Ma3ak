const express = require('express');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');
const { canAccessPatient } = require('../utils/access');

const router = express.Router();

// نفس الـ 15 دقيقة المسموحة قبل الميعاد في الفرونت إند (PatientHome.js) - لازم الاتنين متطابقين
const DOSE_EARLY_MINUTES = 15;

router.post('/:id/take', authRequired, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM doses WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'الجرعة مش موجودة' });
  const dose = rows[0];
  if (!(await canAccessPatient(req.user, dose.patient_id))) {
    return res.status(403).json({ error: 'مفيش صلاحية' });
  }
  if (dose.status !== 'pending') {
    return res.status(409).json({ error: 'الجرعة دي مسجّلة قبل كده' });
  }
  const availableFrom = new Date(new Date(dose.scheduled_at).getTime() - DOSE_EARLY_MINUTES * 60000);
  if (new Date() < availableFrom) {
    return res.status(403).json({ error: 'لسه بدري، الجرعة دي مش وصلت ميعادها' });
  }
  await pool.query("UPDATE doses SET status = 'taken', taken_at = NOW() WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

router.get('/', authRequired, async (req, res) => {
  const { patientId, from, to } = req.query;
  if (!patientId) return res.status(400).json({ error: 'لازم تحدد المريض' });
  if (!(await canAccessPatient(req.user, patientId))) {
    return res.status(403).json({ error: 'مفيش صلاحية' });
  }
  const params = [patientId];
  let sql = `SELECT d.*, m.name FROM doses d JOIN medications m ON m.id = d.medication_id WHERE d.patient_id = ?`;
  if (from) {
    sql += ' AND d.scheduled_at >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND d.scheduled_at <= ?';
    params.push(to);
  }
  sql += ' ORDER BY d.scheduled_at DESC LIMIT 200';
  const [rows] = await pool.query(sql, params);
  res.json({ doses: rows });
});

module.exports = router;
