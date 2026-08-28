const express = require('express');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const { canAccessPatient } = require('../utils/access');
const { cairoNowString, formatCairoClock } = require('../utils/time');
const { isValidDateTime, normalizeDateTime } = require('../utils/validate');
const { notifyUsers, getCaregiverIds } = require('../utils/notify');

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

/* ---------------------------------------------------------------------------
   القراءة الخطرة

   RANGES فوق بتتأكد إن الرقم **منطقي** (مش 900) - مش إنه **خطر**. وده كان
   أوضح فجوة في التطبيق: المريض عنده زرار "سجّل قياس" في شاشته، ويسجّل ضغط
   200/130، والتطبيق يقبله في صمت - والمتابع عمره ما هيعرف إلا لو فتح تاب
   القياسات بنفسه وبص.

   القراءة الخطرة أوضح إشارة إنذار في التطبيق كله، وكانت الوحيدة اللي مبتولّدش
   أي تنبيه.

   ⚠️ العتبات دي **مش تشخيص طبي** - هي حدود "طمّن عليه دلوقتي" المتعارف عليها
   عمومًا لكبار السن. الغرض منها إن حد يبص، مش إنها تقول إيه المشكلة.
   --------------------------------------------------------------------------- */
const CRITICAL_LIMITS = {
  systolic: { low: 90, high: 180 },
  diastolic: { low: 50, high: 120 },
  blood_sugar: { low: 70, high: 300 },
  heart_rate: { low: 45, high: 130 },
  temperature: { low: 35, high: 39 },
  // الوزن مالوش عتبة لحظية - تغيّره بيتقاس على مدى أيام مش في قراءة واحدة
};

// بيرجع نص الوصف لو القراءة خطرة، أو null
function describeCriticalVital(type, value) {
  const outside = (n, limit) => (n < limit.low ? 'منخفض' : n > limit.high ? 'مرتفع' : null);

  if (type === 'blood_pressure') {
    const sys = outside(Number(value.systolic), CRITICAL_LIMITS.systolic);
    const dia = outside(Number(value.diastolic), CRITICAL_LIMITS.diastolic);
    if (!sys && !dia) return null;
    return `ضغط ${sys || dia}: ${Number(value.systolic)}/${Number(value.diastolic)}`;
  }

  const limit = CRITICAL_LIMITS[type];
  if (!limit) return null;
  const state = outside(Number(value.value), limit);
  if (!state) return null;

  const labels = {
    blood_sugar: ['سكر', 'mg/dL'],
    heart_rate: ['نبض', 'نبضة/دقيقة'],
    temperature: ['حرارة', '°'],
  };
  const [label, unit] = labels[type];
  return `${label} ${state}: ${Number(value.value)} ${unit}`;
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

    /* قراءة خطرة → تنبيه حرج للمتابعين فورًا.

       أولويته critical عن قصد: بيخترق ساعات الهدوء وتفضيلات النوع، زي الجرعة
       الحرجة الفايتة بالظبط. ضغط 200/130 الساعة 2 بالليل مش هيستنى الصبح -
       وده بالظبط الفرق اللي utils/notify.js متبني عليه بين "مفكّرة" و"شبكة أمان". */
    const alert = describeCriticalVital(type, value);
    if (alert) {
      const [patientRows] = await pool.query('SELECT name FROM users WHERE id = ?', [patientId]);
      const patientName = patientRows.length ? patientRows[0].name : 'المريض';
      const message = `قراءة محتاجة انتباه لـ ${patientName} - ${alert} (الساعة ${formatCairoClock(at)})`;

      /* مفيش dedupeKey: كل قراءة خطرة حدث مستقل، ودمج التانية في الأولى معناه
         إن المتابع ميعرفش إن الحالة اتكررت أو اتغيّرت. */
      await notifyUsers(await getCaregiverIds(patientId), {
        patientId,
        type: 'patient_issue',
        priority: 'critical',
        relatedId: result.insertId,
        message,
        push: {
          title: '🩺 قراءة محتاجة انتباه',
          body: message,
          tag: `vital-${result.insertId}`,
          url: '/',
        },
      });
    }

    res.status(201).json({ id: result.insertId, alert: alert || null });
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
