const express = require('express');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const { canAccessPatient } = require('../utils/access');
const { cairoNowString } = require('../utils/time');
const { isValidDateTime, normalizeDateTime } = require('../utils/validate');

const router = express.Router();

const ALLOWED_TYPES = ['blood_pressure', 'blood_sugar', 'weight', 'heart_rate', 'temperature'];

/* حدود منطقية لكل قياس - مش تشخيص طبي، بس بتمنع الغلط الواضح في الكتابة
   (وزن 700 كجم، ضغط 900) إنه يتخزن ويطلع في شاشة المتابع كأنه قراءة حقيقية. */
const RANGES = {
  systolic: [40, 300],
  diastolic: [20, 200],
  blood_sugar: [10, 900],
  weight: [1, 400],
  heart_rate: [20, 300],
  temperature: [25, 45],
};

function inRange(n, [min, max]) {
  return Number.isFinite(n) && n >= min && n <= max;
}

/* بيتأكد إن قيمة القياس مكتوبة بالشكل اللي الواجهة بتقراه فعلاً - من غير كده
   ممكن يتخزن أوبجكت غريب ويكسر شاشة القياسات وقت العرض.
   بيرجع رسالة الخطأ العربية، أو null لو كله تمام. */
function validateVitalValue(type, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'قيمة القياس مش مكتوبة صح';
  }

  if (type === 'blood_pressure') {
    const { systolic, diastolic } = value;
    if (!inRange(Number(systolic), RANGES.systolic) || !inRange(Number(diastolic), RANGES.diastolic)) {
      return 'قراءة الضغط مش منطقية، راجع الأرقام';
    }
    if (Number(systolic) <= Number(diastolic)) {
      return 'الرقم الانقباضي لازم يكون أكبر من الانبساطي';
    }
    return null;
  }

  if (!inRange(Number(value.value), RANGES[type])) {
    return 'قيمة القياس مش منطقية، راجع الرقم';
  }
  return null;
}

router.get(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const { patientId, type } = req.query;
    if (!patientId) return res.status(400).json({ error: 'لازم تحدد المريض' });
    if (type && !ALLOWED_TYPES.includes(type)) {
      return res.status(400).json({ error: 'نوع القياس غير معروف' });
    }
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
  })
);

router.post(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const { patientId, type, value, recordedAt } = req.body;
    if (!patientId || !type || !value) {
      return res.status(400).json({ error: 'من فضلك املأ كل البيانات' });
    }
    if (!ALLOWED_TYPES.includes(type)) {
      return res.status(400).json({ error: 'نوع القياس غير معروف' });
    }

    const valueError = validateVitalValue(type, value);
    if (valueError) return res.status(400).json({ error: valueError });

    if (recordedAt != null && !isValidDateTime(recordedAt)) {
      return res.status(400).json({ error: 'وقت القياس مش مكتوب صح' });
    }

    if (!(await canAccessPatient(req.user, patientId))) {
      return res.status(403).json({ error: 'مفيش صلاحية' });
    }

    /* لو العميل مبعتش وقت، بنستخدم "دلوقتي بتوقيت مصر" مش new Date() (اللي بترجع
       توقيت السيرفر). على Render السيرفر شغال UTC، فـ new Date() كانت بتخزن القياس
       متأخر 2-3 ساعات عن الساعة الحقيقية عند المستخدم - وده بيخلي ترتيب القياسات
       وعرضها غلط. باقي المشروع كله متوحّد على utils/time.js، وده كان آخر مكان فايت. */
    const at = recordedAt ? normalizeDateTime(recordedAt) : cairoNowString();

    const [result] = await pool.query(
      'INSERT INTO vitals (patient_id, type, value_json, recorded_at) VALUES (?, ?, ?, ?)',
      [patientId, type, JSON.stringify(value), at]
    );
    res.status(201).json({ id: result.insertId });
  })
);

router.delete(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM vitals WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'القياس مش موجود' });
    const vital = rows[0];
    if (!(await canAccessPatient(req.user, vital.patient_id))) {
      return res.status(403).json({ error: 'مفيش صلاحية' });
    }
    await pool.query('DELETE FROM vitals WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  })
);

module.exports = router;
