const express = require('express');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const { canAccessPatient } = require('../utils/access');
// نفس ملف الـ 15 دقيقة المستخدم في شاشة المريض (frontend/js/doseLogic.js) - مصدر واحد للحقيقة
// بدل رقم مكرر في مكانين ممكن ينحرفوا عن بعض. الملف بلا JSX عمدًا فبيتطلّب هنا زي أي ملف Node عادي.
const { getDoseAvailability } = require('../../frontend/js/doseLogic');
const { cairoNowString } = require('../utils/time');
const { isValidDate, isValidDateTime, normalizeDateTime } = require('../utils/validate');

const router = express.Router();

router.post(
  '/:id/take',
  authRequired,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM doses WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'الجرعة مش موجودة' });
    const dose = rows[0];
    if (!(await canAccessPatient(req.user, dose.patient_id))) {
      return res.status(403).json({ error: 'مفيش صلاحية' });
    }
    if (dose.status !== 'pending') {
      return res.status(409).json({ error: 'الجرعة دي مسجّلة قبل كده' });
    }
    if (getDoseAvailability(dose.scheduled_at, new Date()).isEarly) {
      return res.status(403).json({ error: 'لسه بدري، الجرعة دي مش وصلت ميعادها' });
    }
    await pool.query("UPDATE doses SET status = 'taken', taken_at = ? WHERE id = ?", [
      cairoNowString(),
      req.params.id,
    ]);
    res.json({ ok: true });
  })
);

/* بيقبل "YYYY-MM-DD" (يوم كامل) أو "YYYY-MM-DD HH:MM[:SS]" ويحوّلهم لصيغة
   واحدة تفهمها MySQL. أي حاجة تانية بترجع null عشان الـ route يرفضها بـ400
   بدل ما تتبعت لقاعدة البيانات وتطلّع خطأ. */
function parseRangeBound(value, endOfDay) {
  if (isValidDateTime(value)) return normalizeDateTime(value);
  if (isValidDate(value)) return `${value} ${endOfDay ? '23:59:59' : '00:00:00'}`;
  return null;
}

router.get(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const { patientId, from, to } = req.query;
    if (!patientId) return res.status(400).json({ error: 'لازم تحدد المريض' });
    if (!(await canAccessPatient(req.user, patientId))) {
      return res.status(403).json({ error: 'مفيش صلاحية' });
    }

    const params = [patientId];
    let sql = `SELECT d.*, m.name FROM doses d JOIN medications m ON m.id = d.medication_id WHERE d.patient_id = ?`;

    if (from) {
      const fromAt = parseRangeBound(from, false);
      if (!fromAt) return res.status(400).json({ error: 'تاريخ البداية مش مكتوب صح' });
      sql += ' AND d.scheduled_at >= ?';
      params.push(fromAt);
    }
    if (to) {
      const toAt = parseRangeBound(to, true);
      if (!toAt) return res.status(400).json({ error: 'تاريخ النهاية مش مكتوب صح' });
      sql += ' AND d.scheduled_at <= ?';
      params.push(toAt);
    }

    sql += ' ORDER BY d.scheduled_at DESC LIMIT 200';
    const [rows] = await pool.query(sql, params);
    res.json({ doses: rows });
  })
);

module.exports = router;
