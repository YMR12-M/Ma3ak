/* ============================================
   MA3ak (معاك) - تسجيل أجهزة الـ Web Push

   المتصفح هو اللي بيعمل الاشتراك عند خدمة الدفع بتاعته وبيرجّعلنا
   { endpoint, keys: { p256dh, auth } }. دور الملف ده إنه يخزّن الثلاثة دول
   ويربطهم بالمستخدم، عشان utils/push.js يعرف يبعت لأنهي أجهزة.
   ============================================ */

const express = require('express');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const { getPublicKey, isPushEnabled, sendToUser } = require('../utils/push');
const { pushTestLimiter } = require('../middleware/rateLimit');

const router = express.Router();

/* المفتاح العام مش سر - هو معمول عشان يتوزّع (اسمه "عام" حرفيًا). المتصفح
   محتاجه قبل ما يقدر يعمل اشتراك أصلاً، فمفتوح من غير تسجيل دخول عمدًا. */
router.get('/public-key', (req, res) => {
  res.json({ publicKey: getPublicKey(), enabled: isPushEnabled() });
});

router.post(
  '/subscribe',
  authRequired,
  asyncHandler(async (req, res) => {
    const { endpoint, keys } = req.body || {};
    if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
      return res.status(400).json({ error: 'بيانات الاشتراك مش صحيحة' });
    }
    if (endpoint.length > 500) {
      return res.status(400).json({ error: 'عنوان الاشتراك طويل أوي' });
    }
    if (!keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
      return res.status(400).json({ error: 'مفاتيح الاشتراك ناقصة' });
    }

    /* ON DUPLICATE KEY بدل INSERT عادي: نفس الجهاز بيبعت نفس الـ endpoint في
       كل مرة يفتح فيها التطبيق. من غير ده كنا هنرمي 409 على حاجة طبيعية تمامًا.
       وكمان بينقل الاشتراك لصاحبه الجديد لو الجهاز اتشارك (المتابع دخل بحسابه
       على موبايل المريض مثلاً) - وده الصح: الجهاز الواحد بيخص مستخدم واحد. */
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         user_id = VALUES(user_id),
         p256dh = VALUES(p256dh),
         auth = VALUES(auth),
         user_agent = VALUES(user_agent),
         fail_count = 0`,
      [
        req.user.id,
        endpoint,
        keys.p256dh,
        keys.auth,
        String(req.headers['user-agent'] || '').slice(0, 255) || null,
      ]
    );

    res.status(201).json({ ok: true });
  })
);

router.post(
  '/unsubscribe',
  authRequired,
  asyncHandler(async (req, res) => {
    const { endpoint } = req.body || {};
    if (typeof endpoint !== 'string') {
      return res.status(400).json({ error: 'بيانات الاشتراك مش صحيحة' });
    }
    // شرط user_id مش زيادة: بيمنع مستخدم إنه يلغي اشتراك جهاز مستخدم تاني
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', [
      endpoint,
      req.user.id,
    ]);
    res.json({ ok: true });
  })
);

/* الأجهزة المسجّلة للمستخدم الحالي - بتبان في الإعدادات عشان يعرف مين مشترك
   ويقدر يشيل جهاز قديم. مبنرجّعش المفاتيح ولا الـ endpoint كامل. */
router.get(
  '/devices',
  authRequired,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT id, user_agent, last_success_at, created_at
         FROM push_subscriptions WHERE user_id = ? ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ devices: rows });
  })
);

router.delete(
  '/devices/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM push_subscriptions WHERE id = ? AND user_id = ?', [
      req.params.id,
      req.user.id,
    ]);
    res.json({ ok: true });
  })
);

/* إشعار تجريبي للمستخدم نفسه. مش رفاهية: مفيش طريقة تانية يتأكد بيها المتابع
   إن التنبيه هيوصله فعلاً على الجهاز ده - والبديل إنه يكتشف إنه مش شغال يوم
   ما جرعة مهمة تفوت. */
router.post(
  '/test',
  authRequired,
  // authRequired قبله عشان الحد يتحسب على الحساب مش على الـ IP
  pushTestLimiter,
  asyncHandler(async (req, res) => {
    if (!isPushEnabled()) {
      return res.status(503).json({ error: 'خدمة الإشعارات مش مفعّلة على السيرفر' });
    }
    const { sent, removed, failed } = await sendToUser(req.user.id, {
      title: 'معاك - تجربة ✅',
      body: 'التنبيهات شغالة على الجهاز ده',
      tag: 'ma3ak-test',
      url: '/',
      priority: 'normal',
      ttl: 60,
    });
    /* الرسايل التلاتة مختلفة عن قصد: الزرار ده موجود عشان المستخدم يشخّص
       المشكلة، ورسالة واحدة عامة بتخليه يجرب نفس الحاجة تاني بدل ما يعرف
       يعمل إيه. */
    if (!sent) {
      if (removed) {
        return res
          .status(404)
          .json({ error: 'الاشتراك على الجهاز ده مبقاش صالح - فعّل التنبيهات تاني' });
      }
      if (failed) {
        return res
          .status(502)
          .json({ error: 'مقدرناش نوصل لخدمة الإشعارات دلوقتي - جرّب تاني بعد شوية' });
      }
      return res.status(404).json({ error: 'مفيش أجهزة مسجّلة للتنبيهات' });
    }
    res.json({ ok: true, sent });
  })
);

module.exports = router;
