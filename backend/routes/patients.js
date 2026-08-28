const express = require('express');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const { linkPatientLimiter, pushTestLimiter } = require('../middleware/rateLimit');
const { canAccessPatient } = require('../utils/access');
const { generateUniqueLinkCode, generateUniqueAccessToken } = require('../utils/codes');
const { LIMITS, isNonEmptyString, isTooLong } = require('../utils/validate');
const { notifyUsers, getCaregiverIds, getPrefs } = require('../utils/notify');
const { sendToUser, isPushEnabled } = require('../utils/push');
const { cairoToday, cairoDateWithOffset, formatCairoClock } = require('../utils/time');

const router = express.Router();

// المتابع بيضيف مريض جديد بنفسه (اسم + موبايل اختياري) - المريض مش لازم يعمل أي حاجة
router.post(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'caregiver') {
      return res.status(403).json({ error: 'المتابعين بس اللي يقدروا يضيفوا مريض' });
    }
    const { name, phone } = req.body;
    if (!isNonEmptyString(name)) return res.status(400).json({ error: 'من فضلك اكتب اسم المريض' });
    if (isTooLong(name, LIMITS.userName)) {
      return res.status(400).json({ error: `الاسم طويل أوي (أقصى ${LIMITS.userName} حرف)` });
    }
    if (isTooLong(phone, LIMITS.phone)) {
      return res.status(400).json({ error: 'رقم الموبايل مش مكتوب صح' });
    }

    if (phone) {
      const [dup] = await pool.query('SELECT id FROM users WHERE phone = ?', [phone]);
      if (dup.length) return res.status(409).json({ error: 'رقم الموبايل ده مسجل قبل كده' });
    }

    const linkCode = await generateUniqueLinkCode();
    const accessToken = await generateUniqueAccessToken();
    const patientName = name.trim();

    const [result] = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, phone, link_code, access_token)
     VALUES (?, NULL, NULL, 'patient', ?, ?, ?)`,
      [patientName, phone || null, linkCode, accessToken]
    );

    await pool.query('INSERT INTO patient_caregiver (patient_id, caregiver_id) VALUES (?, ?)', [
      result.insertId,
      req.user.id,
    ]);

    res.status(201).json({
      patient: {
        id: result.insertId,
        name: patientName,
        phone: phone || null,
        link_code: linkCode,
        access_token: accessToken,
      },
    });
  })
);

// متابع تاني بينضم لمتابعة مريض موجود بالفعل عن طريق كود المشاركة
// (محمي بحد محاولات - الكود قصير عمدًا عشان يتقال بالتليفون، فلازم يتحمي من التخمين)
router.post(
  '/link',
  authRequired,
  linkPatientLimiter,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'caregiver') {
      return res.status(403).json({ error: 'المتابعين بس اللي ممكن يربطوا مريض' });
    }
    const { code } = req.body;
    if (!isNonEmptyString(code)) return res.status(400).json({ error: 'من فضلك اكتب كود المشاركة' });

    const [rows] = await pool.query('SELECT * FROM users WHERE link_code = ? AND role = "patient"', [
      String(code).trim().toUpperCase(),
    ]);
    if (!rows.length) return res.status(404).json({ error: 'الكود غير صحيح' });
    const patient = rows[0];

    try {
      await pool.query('INSERT INTO patient_caregiver (patient_id, caregiver_id) VALUES (?, ?)', [
        patient.id,
        req.user.id,
      ]);
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'انت متابع للمريض ده بالفعل' });
      }
      throw e; // أي خطأ تاني يروح لمعالج الأخطاء العام
    }

    res.status(201).json({ patient: { id: patient.id, name: patient.name, phone: patient.phone } });
  })
);

// تصنيفات المشاكل اللي المريض ممكن يبلّغ عنها من زرار "حصلت مشكلة؟"
/* urgent = الإشعار ده أولويته critical: بيخترق ساعات الهدوء وتفضيلات النوع.
   مش كل بلاغ يستاهل ده - "الدوا خلص" ممكن يستنى الصبح، لكن "حاسس بتعب بعد
   الدوا" و"عايز حد يتصل بيه" ما ينفعش يستنوا. التفرقة دي هي كل الفايدة من
   نظام الأولويات: من غيرها يا كل حاجة بترن بالليل يا مفيش حاجة بترن. */
const ISSUE_LABELS = {
  med_finished: { label: 'الدوا خلص وعايز عبوة جديدة', urgent: false },
  forgot_dose: { label: 'نسي ياخد جرعة', urgent: false },
  side_effect: { label: 'حاسس بتعب أو حاجة غريبة بعد الدوا', urgent: true },
  unclear_dose: { label: 'مش متأكد إزاي ياخد الدوا', urgent: false },
  want_call: { label: 'عايز حد يتصل بيه دلوقتي', urgent: true },
  other: { label: 'عنده مشكلة تانية', urgent: false },
};

// عمود notifications.message طوله 255 - بنقص الرسالة قبل كده بأمان عشان اسم دواء
// طويل ما يخليش الإدخال كله يفشل
const MESSAGE_MAX = 255;

router.post(
  '/:id/report-issue',
  authRequired,
  asyncHandler(async (req, res) => {
    const patientId = req.params.id;
    /* المريض بس. canAccessPatient لوحده بيمرّر المتابع كمان، فكان المتابع يقدر
       يبعت بلاغ **باسم المريض** ("فلان بلّغ إن...") لباقي المتابعين بينما
       المريض عمره ما عمل حاجة - سجل غلط في شاشة الإشعارات. */
    if (req.user.role !== 'patient') {
      return res.status(403).json({ error: 'البلاغ ده بيتبعت من المريض نفسه بس' });
    }
    if (!(await canAccessPatient(req.user, patientId))) {
      return res.status(403).json({ error: 'مفيش صلاحية' });
    }

    const { issueType, medicationName } = req.body;
    const issue = ISSUE_LABELS[issueType];
    if (!issue) return res.status(400).json({ error: 'نوع المشكلة غير معروف' });

    const [patientRows] = await pool.query('SELECT name FROM users WHERE id = ?', [patientId]);
    const patientName = patientRows.length ? patientRows[0].name : 'المريض';

    const message = (
      issueType === 'med_finished' && isNonEmptyString(medicationName)
        ? `${patientName} بلّغ إن دوا "${String(medicationName).trim()}" خلص وعايز عبوة جديدة`
        : `${patientName} بلّغ: ${issue.label}`
    ).slice(0, MESSAGE_MAX);

    const caregiverIds = await getCaregiverIds(patientId);

    /* مفيش dedupeKey هنا عمدًا، بعكس إشعارات الـ scheduler: البلاغ ده فعل
       متعمّد من المريض. لو بلّغ مرتين يبقى قصده يبلّغ مرتين - ودمج التانية في
       الأولى معناه إن المتابع ميعرفش إن فيه حاجة بتتكرر. */
    await notifyUsers(caregiverIds, {
      patientId,
      type: 'patient_issue',
      priority: issue.urgent ? 'critical' : 'normal',
      message,
      push: {
        title: issue.urgent ? '🚨 بلاغ عاجل' : 'بلاغ من المريض',
        body: message,
        tag: `issue-${patientId}-${Date.now()}`,
        url: '/',
      },
    });

    res.status(201).json({ ok: true, notified: caregiverIds.length });
  })
);

// توليد لينك دخول جديد للمريض (يلغي القديم - مفيد لو اللينك القديم اتسرب)
router.post(
  '/:id/regenerate-link',
  authRequired,
  asyncHandler(async (req, res) => {
    const patientId = req.params.id;
    if (!(await canAccessPatient(req.user, patientId))) {
      return res.status(403).json({ error: 'مفيش صلاحية' });
    }
    const accessToken = await generateUniqueAccessToken();
    await pool.query('UPDATE users SET access_token = ? WHERE id = ? AND role = "patient"', [
      accessToken,
      patientId,
    ]);
    res.json({ access_token: accessToken });
  })
);

// المتابعين اللي بيتابعوا مريض معين - بيستخدمها المريض عشان يشوف "متابعك" في شاشته
router.get(
  '/:id/caregivers',
  authRequired,
  asyncHandler(async (req, res) => {
    const patientId = req.params.id;
    if (!(await canAccessPatient(req.user, patientId))) {
      return res.status(403).json({ error: 'مفيش صلاحية' });
    }
    /* الموبايل هنا مش تفصيلة: كارت "متابعك" في شاشة المريض كان بيعرض الاسم
       وخلاص، فكبير السن اللي حاسس بتعب كان قدامه بلاغ يبعته ويستنى - مش زرار
       يرن بيه على ابنه. الرقم ده هو اللي بيخلي زرار الاتصال ممكن أصلاً.

       مفيش تسريب: المسار محمي بـ canAccessPatient، يعني اللي بيقراه إما المريض
       نفسه أو متابع مربوط - والاتنين المفروض يعرفوا أرقام بعض. */
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.phone
     FROM users u
     JOIN patient_caregiver pc ON pc.caregiver_id = u.id
     WHERE pc.patient_id = ?
     ORDER BY pc.created_at ASC`,
      [patientId]
    );
    res.json({ caregivers: rows });
  })
);

/* ---------------------------------------------------------------------------
   فك الارتباط والحذف

   مكانش فيه أي طريقة تشيل مريض ولا متابع. غير إنها فجوة في الاستخدام العادي
   (متابع انضم بالغلط، مريض توفّى)، دي كمان فجوة أمنية: بعد ما حد ينضم بكود
   المشاركة، مكانش فيه أي طريقة تخرجه.
   --------------------------------------------------------------------------- */

// المتابع بيخرج من متابعة مريض (بيسيب غيره يكمّل)
router.delete(
  '/:id/link',
  authRequired,
  asyncHandler(async (req, res) => {
    const patientId = req.params.id;
    if (!(await canAccessPatient(req.user, patientId))) {
      return res.status(403).json({ error: 'مفيش صلاحية' });
    }
    if (req.user.role !== 'caregiver') {
      return res.status(403).json({ error: 'المتابعين بس' });
    }

    const caregiverIds = await getCaregiverIds(patientId);
    /* آخر متابع مينفعش يسيب المريض ويمشي: المريض هيفضل بياخد منبهات ومحدش
       شايف حالته ولا قادر يوصل لبياناته - أسوأ من الحذف نفسه، لأنه فشل صامت. */
    if (caregiverIds.length <= 1) {
      return res.status(409).json({
        error: 'انت آخر متابع للمريض ده - لو عايز تشيله بجد استخدم "حذف المريض"',
      });
    }

    await pool.query('DELETE FROM patient_caregiver WHERE patient_id = ? AND caregiver_id = ?', [
      patientId,
      req.user.id,
    ]);
    res.json({ ok: true });
  })
);

// شيل متابع تاني من متابعة المريض
router.delete(
  '/:patientId/caregivers/:caregiverId',
  authRequired,
  asyncHandler(async (req, res) => {
    const { patientId, caregiverId } = req.params;

    /* المتابعين بس. canAccessPatient لوحده بيمرّر **المريض على نفسه**، فالمريض
       كان يقدر يشيل متابعينه واحد واحد لحد ما يفضل من غير أي حد - نفس الحالة
       اللي مسار "خروج من المتابعة" تحت محمي منها بالظبط، والحماية كانت ناقصة هنا. */
    if (req.user.role !== 'caregiver') {
      return res.status(403).json({ error: 'المتابعين بس اللي يقدروا يشيلوا متابع' });
    }
    if (!(await canAccessPatient(req.user, patientId))) {
      return res.status(403).json({ error: 'مفيش صلاحية' });
    }
    if (Number(caregiverId) === Number(req.user.id)) {
      // الخروج بنفسك ليه مسار تاني بقواعد مختلفة (شرط آخر متابع فوق)
      return res.status(400).json({ error: 'عشان تخرج انت، استخدم "خروج من المتابعة"' });
    }

    /* نفس شرط "آخر متابع" بتاع مسار الخروج: المريض من غير أي متابع بيفضل
       بياخد منبهات ومحدش شايف حالته ولا قادر يوصل لبياناته - وده فشل صامت
       أسوأ من الحذف نفسه. */
    const caregiverIds = await getCaregiverIds(patientId);
    if (caregiverIds.length <= 1) {
      return res.status(409).json({
        error: 'ده آخر متابع للمريض - مينفعش يفضل من غير حد يتابعه',
      });
    }

    const [result] = await pool.query(
      'DELETE FROM patient_caregiver WHERE patient_id = ? AND caregiver_id = ?',
      [patientId, caregiverId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'المتابع ده مش مربوط بالمريض' });
    res.json({ ok: true });
  })
);

// حذف المريض نهائيًا (بكل بياناته - ON DELETE CASCADE)
router.delete(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const patientId = req.params.id;
    if (req.user.role !== 'caregiver') {
      return res.status(403).json({ error: 'المتابعين بس اللي يقدروا يحذفوا مريض' });
    }
    if (!(await canAccessPatient(req.user, patientId))) {
      return res.status(403).json({ error: 'مفيش صلاحية' });
    }

    /* متابع واحد ميقدرش يمسح بيانات مريض بيتابعه ناس تانية. الحذف هنا بيمسح
       كل تاريخ الأدوية والقياسات لكل المتابعين مرة واحدة، من غير رجعة - فمينفعش
       يكون قرار فردي وقت ما يكون فيه شركا. اللي عايز يمشي بس عنده مسار الخروج. */
    const caregiverIds = await getCaregiverIds(patientId);
    if (caregiverIds.length > 1) {
      return res.status(409).json({
        error: 'فيه متابعين تانيين للمريض ده - مينفعش تمسح بياناته من غير ما يخرجوا الأول',
      });
    }

    const [rows] = await pool.query('SELECT role FROM users WHERE id = ?', [patientId]);
    if (!rows.length || rows[0].role !== 'patient') {
      return res.status(404).json({ error: 'المريض مش موجود' });
    }

    await pool.query('DELETE FROM users WHERE id = ? AND role = "patient"', [patientId]);
    res.json({ ok: true });
  })
);

/* ---------------------------------------------------------------------------
   حالة تنبيهات المريض - عند المتابع

   دي كانت أكبر فجوة منطقية في النظام كله: **المتابع بيجهّز كل حاجة، والتنبيه
   بيروح لجهاز مش في إيده.** مكانش عنده أي مؤشر إن موبايل المريض مسجّل اشتراك
   أصلاً، فكان مطمّن إن النظام شغال ويكتشف العكس يوم ما جرعة مهمة تفوت.
   --------------------------------------------------------------------------- */
router.get(
  '/:id/notification-status',
  authRequired,
  asyncHandler(async (req, res) => {
    const patientId = req.params.id;
    if (!(await canAccessPatient(req.user, patientId))) {
      return res.status(403).json({ error: 'مفيش صلاحية' });
    }

    const [devices] = await pool.query(
      `SELECT id, user_agent, last_success_at, created_at
         FROM push_subscriptions WHERE user_id = ? ORDER BY created_at DESC`,
      [patientId]
    );
    const prefs = await getPrefs(patientId);

    // آخر إشعار وصل فعلاً لجهاز المريض - أقوى دليل عملي على إن القناة شغالة
    const [[lastDelivered]] = await pool.query(
      `SELECT MAX(delivered_at) AS at FROM notifications WHERE user_id = ?`,
      [patientId]
    );

    res.json({
      serverPushEnabled: isPushEnabled(),
      deviceCount: devices.length,
      devices,
      pushEnabledByUser: Boolean(prefs.push_enabled),
      lastDeliveredAt: lastDelivered.at || null,
      // خلاصة واحدة تلوّن الشارة في الواجهة من غير ما تعيد المنطق ده هناك
      ok: isPushEnabled() && devices.length > 0 && Boolean(prefs.push_enabled),
    });
  })
);

// المتابع بيبعت تنبيه تجريبي لموبايل المريض - عشان يتأكد بنفسه إنه شغال
router.post(
  '/:id/test-alarm',
  authRequired,
  pushTestLimiter,
  asyncHandler(async (req, res) => {
    const patientId = req.params.id;
    if (!(await canAccessPatient(req.user, patientId))) {
      return res.status(403).json({ error: 'مفيش صلاحية' });
    }
    if (!isPushEnabled()) {
      return res.status(503).json({ error: 'خدمة الإشعارات مش مفعّلة على السيرفر' });
    }

    const { sent, removed, failed } = await sendToUser(patientId, {
      title: 'معاك - تجربة 🔔',
      body: `${req.user.name} بيتأكد إن التنبيهات شغالة على الموبايل ده`,
      tag: 'ma3ak-test',
      url: '/',
      priority: 'normal',
      ttl: 60,
    });

    if (!sent) {
      if (removed) {
        return res
          .status(404)
          .json({ error: 'اشتراك موبايل المريض مبقاش صالح - لازم يفعّل التنبيهات من عنده تاني' });
      }
      if (failed) {
        return res.status(502).json({ error: 'مقدرناش نوصل لخدمة الإشعارات دلوقتي - جرّب تاني' });
      }
      return res
        .status(404)
        .json({ error: 'موبايل المريض لسه مفعّلش التنبيهات - افتح التطبيق عنده ودوس "تفعيل"' });
    }
    res.json({ ok: true, sent });
  })
);

/* ---------------------------------------------------------------------------
   تقرير الالتزام

   البيانات دي كانت متسجّلة في doses من زمان ومحدش بيقراها. التقرير هو اللي
   بيحوّل التطبيق من "مفكّرة" لحاجة تتاخد للدكتور - ونمط زي "دايمًا بينسى جرعة
   المغرب" مفيش طريقة تانية حد يلاحظه بيها.
   --------------------------------------------------------------------------- */
const ADHERENCE_MAX_DAYS = 90;

router.get(
  '/:id/adherence',
  authRequired,
  asyncHandler(async (req, res) => {
    const patientId = req.params.id;
    if (!(await canAccessPatient(req.user, patientId))) {
      return res.status(403).json({ error: 'مفيش صلاحية' });
    }

    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), ADHERENCE_MAX_DAYS);
    const from = `${cairoDateWithOffset(-(days - 1), '00:00').slice(0, 10)} 00:00:00`;
    // لحد آخر النهاردة، بس الجرعات اللي ميعادها لسه مجاش مبتتحسبش (تحت)
    const to = `${cairoToday()} 23:59:59`;

    const [rows] = await pool.query(
      `SELECT d.id, d.scheduled_at, d.status, d.taken_at, d.medication_id, m.name
         FROM doses d
         JOIN medications m ON m.id = d.medication_id
        WHERE d.patient_id = ? AND d.scheduled_at BETWEEN ? AND ?
        ORDER BY d.scheduled_at ASC`,
      [patientId, from, to]
    );

    /* الجرعة اللي لسه ميعادها مجاش مش "فايتة" ولا "اتاخدت" - لو حسبناها في
       المقام، نسبة الالتزام بتبان أقل من الحقيقة كل يوم الصبح وبتتحسن لوحدها
       بالليل. الرقم اللي بيتحرك من غير سبب حقيقي رقم مضلل. */
    const counted = rows.filter((d) => d.status !== 'pending');

    const taken = counted.filter((d) => d.status === 'taken').length;
    const missed = counted.filter((d) => d.status === 'missed').length;
    const rate = counted.length ? Math.round((taken / counted.length) * 100) : null;

    // تجميع لكل يوم (للرسم البياني)
    const byDay = new Map();
    for (const d of counted) {
      const day = String(d.scheduled_at).slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, { day, taken: 0, missed: 0 });
      byDay.get(day)[d.status === 'taken' ? 'taken' : 'missed'] += 1;
    }

    // تجميع لكل دواء - بيوضّح "أنهي دوا بالذات بيتنسى"
    const byMed = new Map();
    for (const d of counted) {
      if (!byMed.has(d.medication_id)) {
        byMed.set(d.medication_id, { id: d.medication_id, name: d.name, taken: 0, missed: 0 });
      }
      byMed.get(d.medication_id)[d.status === 'taken' ? 'taken' : 'missed'] += 1;
    }

    /* تجميع لكل ميعاد في اليوم - ده اللي بيطلّع النمط المفيد فعلاً للدكتور
       وللمتابع: "جرعة 8 الصبح بتتاخد دايمًا، وجرعة 10 بالليل بتتنسى نص المرات". */
    const byTime = new Map();
    for (const d of counted) {
      const clock = String(d.scheduled_at).slice(11, 16);
      if (!byTime.has(clock)) byTime.set(clock, { time: clock, label: formatCairoClock(d.scheduled_at), taken: 0, missed: 0 });
      byTime.get(clock)[d.status === 'taken' ? 'taken' : 'missed'] += 1;
    }

    const times = [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time));
    // أسوأ ميعاد: أعلى عدد جرعات فايتة، بشرط يكون فات مرتين على الأقل عشان
    // ما نطلّعش "نمط" من صدفة واحدة
    const worstTime = times.filter((t) => t.missed >= 2).sort((a, b) => b.missed - a.missed)[0] || null;

    res.json({
      days,
      from: from.slice(0, 10),
      to: to.slice(0, 10),
      total: counted.length,
      taken,
      missed,
      rate,
      pendingNotCounted: rows.length - counted.length,
      byDay: [...byDay.values()],
      byMedication: [...byMed.values()].sort((a, b) => b.missed - a.missed),
      byTime: times,
      worstTime,
    });
  })
);

// المرضى المرتبطين بالمستخدم الحالي (المريض نفسه، أو مرضى المتابع)
router.get(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    if (req.user.role === 'patient') {
      const [rows] = await pool.query('SELECT id, name, email, phone FROM users WHERE id = ?', [
        req.user.id,
      ]);
      return res.json({ patients: rows });
    }

    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.link_code, u.access_token
     FROM users u
     JOIN patient_caregiver pc ON pc.patient_id = u.id
     WHERE pc.caregiver_id = ?
     ORDER BY u.name ASC`,
      [req.user.id]
    );
    res.json({ patients: rows });
  })
);

module.exports = router;
