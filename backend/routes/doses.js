const express = require('express');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const { canAccessPatient } = require('../utils/access');
/* نفس ملف منطق التوقيت المستخدم في شاشة المريض (frontend/js/doseLogic.js) - مصدر واحد
   للحقيقة بدل أرقام مكررة في مكانين ممكن ينحرفوا عن بعض. الملف بلا JSX عمدًا فبيتطلّب
   هنا زي أي ملف Node عادي. */
const {
  getDoseAvailability,
  canSnoozeDose,
  SNOOZE_MINUTES,
  MAX_SNOOZES,
  DOSE_LATE_TAKE_HOURS,
} = require('../../frontend/js/doseLogic');
const { cairoNowString, cairoNowPlusMinutes } = require('../utils/time');
const { verifyDoseAction } = require('../utils/actionToken');
const { isValidDate, isValidDateTime, normalizeDateTime } = require('../utils/validate');
const { notifyUsers, getCaregiverIds } = require('../utils/notify');

const router = express.Router();

/* ---------------------------------------------------------------------------
   كمية الدوا

   "الدوا خلص" كان بلاغ **رجعي**: المريض بيبلّغ بعد ما الدوا يخلص فعلاً،
   والمتابع ساعتها ممكن يحتاج يوم أو اتنين يجيبه - وكبير السن يقعد الأيام دي
   من غير دوا ضغط أو قلب. والتطبيق عارف عدد الجرعات اليومية بالظبط، فحساب
   "فاضل كام يوم" تقريبًا مجاني.
   --------------------------------------------------------------------------- */

// بنبلّغ المتابع لما الكمية تكفي أقل من كده - بيدي وقت كافي للصيدلية من غير
// ما يبقى تنبيه بدري أوي بيتجاهل
const LOW_STOCK_DAYS = 5;

/* عدّ عربي سليم: "قرص واحد" / "قرصين" / "3 أقراص" / "12 قرص".
   الرسايل دي بيقراها كبار السن، و"1 أقراص" بتقرا كأن التطبيق مكتوب بإهمال. */
function arabicCount(n, one, two, few) {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${one}`;
}

/* بيقلّل الكمية جرعة واحدة، وبيبلّغ المتابع لو الباقي قرب يخلص.
   بيفشل في صمت عن قصد: تتبّع الكمية ميزة مساعدة، وفشلها مينفعش يخلي تسجيل
   الجرعة نفسه يفشل - الجرعة اتاخدت فعلاً وده اللي يهم. */
async function decrementStock(medicationId) {
  try {
    const [rows] = await pool.query(
      'SELECT id, patient_id, name, times, pills_left, low_stock_notified_at FROM medications WHERE id = ?',
      [medicationId]
    );
    if (!rows.length || rows[0].pills_left === null) return; // مش متتبّع للدوا ده
    const med = rows[0];

    /* النقصان ذرّي في استعلام واحد، مش قراية ثم كتابة: المريض ممكن يسجّل من
       الإشعار والمتابع من شاشته في نفس اللحظة (وده سيناريو حقيقي - applyTake
       نفسها بتتعامل معاه بشرط status)، والاتنين كانوا هيقروا نفس الرقم
       ويكتبوا نفس الناقص - يعني جرعتين اتاخدوا وقرص واحد بس نقص.

       GREATEST مع CAST مش زيادة: العمود UNSIGNED، و0 - 1 فيه بيلف لأكبر
       رقم ممكن بدل ما يقف عند صفر. */
    await pool.query(
      `UPDATE medications
          SET pills_left = GREATEST(CAST(pills_left AS SIGNED) - 1, 0)
        WHERE id = ? AND pills_left IS NOT NULL`,
      [med.id]
    );

    if (med.low_stock_notified_at) return; // اتبعت قبل كده، ولسه محدش جاب عبوة

    // بنقرا القيمة بعد النقصان مش بنحسبها - عشان تبقى هي اللي في القاعدة فعلاً
    const [[fresh]] = await pool.query('SELECT pills_left FROM medications WHERE id = ?', [med.id]);
    const left = Number(fresh.pills_left);

    const times = typeof med.times === 'string' ? JSON.parse(med.times) : med.times;
    const perDay = Array.isArray(times) && times.length ? times.length : 1;
    const daysLeft = Math.floor(left / perDay);
    if (daysLeft > LOW_STOCK_DAYS) return;

    const message =
      left === 0
        ? `دوا "${med.name}" خلص خالص`
        : `دوا "${med.name}" قرب يخلص - فاضل ${arabicCount(left, 'قرص', 'قرصين', 'أقراص')} (${arabicCount(daysLeft, 'يوم', 'يومين', 'أيام')} تقريبًا)`;

    await pool.query('UPDATE medications SET low_stock_notified_at = ? WHERE id = ?', [
      cairoNowString(),
      med.id,
    ]);

    await notifyUsers(await getCaregiverIds(med.patient_id), {
      patientId: med.patient_id,
      type: 'general',
      // مش حرج: ده تنبيه بيدي وقت للتصرّف، مش حالة طارئة - وساعات الهدوء
      // المفروض تأجّله للصبح عادي
      priority: 'normal',
      relatedId: med.id,
      dedupeKey: `lowstock-${med.id}-${left}`,
      message,
      push: { title: 'الدوا قرب يخلص 💊', body: message, tag: `lowstock-${med.id}`, url: '/' },
    });
  } catch (e) {
    console.error('decrementStock error:', e.message);
  }
}

/* ---------------------------------------------------------------------------
   المنطق المشترك بين المسار العادي (المستخدم مسجّل دخول) ومسار الإشعار
   (توكن فعل من الـ Service Worker). الاتنين لازم يطبّقوا نفس القواعد بالظبط -
   فبنكتبها مرة واحدة هنا بدل ما نكررها في مكانين ويفرقوا مع أول تعديل.
   بترجع { status, body } جاهزين للرد.
   --------------------------------------------------------------------------- */

async function applyTake(doseId) {
  const [rows] = await pool.query(
    `SELECT d.*, m.name FROM doses d JOIN medications m ON m.id = d.medication_id WHERE d.id = ?`,
    [doseId]
  );
  if (!rows.length) return { status: 404, body: { error: 'الجرعة مش موجودة' } };
  const dose = rows[0];

  if (dose.status === 'taken') {
    return { status: 409, body: { error: 'الجرعة دي مسجّلة قبل كده' } };
  }

  const availability = getDoseAvailability(dose.scheduled_at, new Date());
  if (availability.isEarly) {
    return { status: 403, body: { error: 'لسه بدري، الجرعة دي مش وصلت ميعادها' } };
  }
  /* جرعة قديمة أوي: بنرفض عشان السجل يفضل يعني حاجة. المريض بيسجّل "خدتها"
     بعد 12 ساعة يبقى ده مش تسجيل جرعة، ده تعديل تاريخ. */
  if (availability.isTooLate) {
    return {
      status: 403,
      body: { error: `عدى أكتر من ${DOSE_LATE_TAKE_HOURS} ساعة على الجرعة دي - مش هينفع تتسجّل` },
    };
  }

  /* بنقبل 'pending' و'missed' الاتنين.
     ليه 'missed' كمان: الجرعة بتتحول لـ"فايتة" تلقائيًا من الـ scheduler بعد
     نص ساعة من غير أي فعل من المريض. المريض اللي بيصحى على المنبه متأخر وياخد
     الدوا فعلاً كان بيلاقي الزرار مقفول، والتطبيق يفضل مسجّل إنه فوّتها - وده
     تسجيل غلط مش تسجيل دقيق. */
  const takenAt = cairoNowString();
  const [result] = await pool.query(
    `UPDATE doses SET status = 'taken', taken_at = ?, snooze_until = NULL
      WHERE id = ? AND status IN ('pending', 'missed')`,
    [takenAt, doseId]
  );
  // 0 صفوف = حد تاني سجّلها في نفس اللحظة (المريض من الإشعار والمتابع من شاشته)
  if (!result.affectedRows) {
    return { status: 409, body: { error: 'الجرعة دي مسجّلة قبل كده' } };
  }

  // بعد التسجيل الناجح بس - وجوّه الشرط ده عشان الجرعة اللي اتسجّلت مرتين
  // (سباق) ما تنقّصش الكمية مرتين
  await decrementStock(dose.medication_id);

  return {
    status: 200,
    body: { ok: true, late: dose.status === 'missed', medName: dose.name },
  };
}

async function applySnooze(doseId) {
  const [rows] = await pool.query(
    `SELECT d.*, m.name, m.is_critical, m.snooze_allowed
       FROM doses d JOIN medications m ON m.id = d.medication_id WHERE d.id = ?`,
    [doseId]
  );
  if (!rows.length) return { status: 404, body: { error: 'الجرعة مش موجودة' } };
  const dose = rows[0];

  if (dose.status !== 'pending') {
    return { status: 409, body: { error: 'الجرعة دي مش مستنية تسجيل' } };
  }
  if (dose.is_critical || !dose.snooze_allowed) {
    // مش قفل تقني - ده قرار طبي المتابع اللي حطه على الدواء ده
    return { status: 403, body: { error: 'الدوا ده مواعيده مش بتتأجل' } };
  }
  if (!canSnoozeDose(dose)) {
    return {
      status: 429,
      body: { error: `أجّلتها ${MAX_SNOOZES} مرات خلاص - محتاج تاخدها دلوقتي` },
    };
  }

  const snoozeUntil = cairoNowPlusMinutes(SNOOZE_MINUTES);
  await pool.query(
    'UPDATE doses SET snooze_until = ?, snooze_count = snooze_count + 1 WHERE id = ?',
    [snoozeUntil, doseId]
  );

  return {
    status: 200,
    body: {
      ok: true,
      snooze_until: snoozeUntil,
      snooze_count: dose.snooze_count + 1,
      snoozes_left: MAX_SNOOZES - (dose.snooze_count + 1),
      minutes: SNOOZE_MINUTES,
    },
  };
}

/* ---------------------------------------------------------------------------
   المسار العادي: المستخدم فاتح التطبيق ومسجّل دخول
   --------------------------------------------------------------------------- */

async function assertDoseAccess(req, res, doseId) {
  const [rows] = await pool.query('SELECT patient_id FROM doses WHERE id = ?', [doseId]);
  if (!rows.length) {
    res.status(404).json({ error: 'الجرعة مش موجودة' });
    return false;
  }
  if (!(await canAccessPatient(req.user, rows[0].patient_id))) {
    res.status(403).json({ error: 'مفيش صلاحية' });
    return false;
  }
  return true;
}

router.post(
  '/:id/take',
  authRequired,
  asyncHandler(async (req, res) => {
    if (!(await assertDoseAccess(req, res, req.params.id))) return;
    const { status, body } = await applyTake(req.params.id);
    res.status(status).json(body);
  })
);

router.post(
  '/:id/snooze',
  authRequired,
  asyncHandler(async (req, res) => {
    if (!(await assertDoseAccess(req, res, req.params.id))) return;
    const { status, body } = await applySnooze(req.params.id);
    res.status(status).json(body);
  })
);

/* ---------------------------------------------------------------------------
   مسار الإشعار: الضغطة اللي بتحصل جوه الإشعار نفسه

   من غير authRequired عمدًا. الـ Service Worker (اللي بينفّذ ضغطة زرار
   "خدته" في الإشعار) **مش بيقدر يقرا localStorage**، فمعندوش توكن الدخول.
   بدله بيبعت التوكن اللي جه مع الإشعار نفسه - توكن مربوط بجرعة واحدة، بينتهي
   خلال 6 ساعات، ومالوش أي صلاحية غير الجرعة دي. التفاصيل في utils/actionToken.js.

   ليه ده مهم أصلاً: من غيره المريض لازم يفتح التطبيق ويدوّر على الجرعة عشان
   يقول "خدتها" - وكبير سن مش هيعمل الرحلة دي، فالميزة كلها بتتجاهل.
   --------------------------------------------------------------------------- */
router.post(
  '/action',
  asyncHandler(async (req, res) => {
    const { token, action } = req.body || {};
    const payload = verifyDoseAction(token);
    if (!payload) {
      return res.status(401).json({ error: 'التنبيه ده انتهت صلاحيته - افتح التطبيق' });
    }

    // التوكن بيقول "الجرعة دي للمريض ده" - بنتأكد إن الصف فعلاً بتاعه، عشان
    // توكن قديم ما ينفعش يتستخدم على جرعة اتنقلت لحد تاني بأي شكل
    const [rows] = await pool.query('SELECT patient_id FROM doses WHERE id = ?', [payload.doseId]);
    if (!rows.length) return res.status(404).json({ error: 'الجرعة مش موجودة' });
    if (Number(rows[0].patient_id) !== Number(payload.uid)) {
      return res.status(403).json({ error: 'مفيش صلاحية' });
    }

    if (action === 'take') {
      const { status, body } = await applyTake(payload.doseId);
      return res.status(status).json(body);
    }
    if (action === 'snooze') {
      const { status, body } = await applySnooze(payload.doseId);
      return res.status(status).json(body);
    }
    return res.status(400).json({ error: 'فعل غير معروف' });
  })
);

/* ---------------------------------------------------------------------------
   قراية الجرعات
   --------------------------------------------------------------------------- */

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
