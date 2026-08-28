/* ============================================
   MA3ak (معاك) - الإشعارات: القراية، الحالة، والتفضيلات
   ============================================ */

const express = require('express');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const { verifyAck } = require('../utils/actionToken');
const { getPrefs, DEFAULT_PREFS } = require('../utils/notify');
const { cairoNowString } = require('../utils/time');

const router = express.Router();

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/* ---------------------------------------------------------------------------
   القراية

   ?since=<id> بيرجّع الجديد بس. قبل كده الواجهة كانت بتجيب 50 صف كاملين كل
   دقيقة لكل مستخدم مفتوح التطبيق - حِمل مستمر على قاعدة البيانات وعلى بيانات
   الموبايل، وأغلبه بيانات المتصفح شايفها بالفعل. مع since الرد بيبقى فاضي
   (بضعة بايتات) في الحالة الطبيعية.
   --------------------------------------------------------------------------- */
router.get(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const since = Number(req.query.since);
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);

    const params = [req.user.id];
    let sql = 'SELECT * FROM notifications WHERE user_id = ?';
    if (Number.isInteger(since) && since > 0) {
      sql += ' AND id > ?';
      params.push(since);
    }
    sql += ' ORDER BY id DESC LIMIT ?';
    params.push(limit);

    const [rows] = await pool.query(sql, params);

    /* العدادات بتتحسب على السيرفر مش على الصفوف المرجّعة: مع since الصفوف
       ممكن تكون فاضية تمامًا والعدد لسه محتاج يبان صح على شارة التاب. */
    const [[counts]] = await pool.query(
      `SELECT
         COUNT(*) AS unread_count,
         SUM(priority = 'critical' AND handled_at IS NULL) AS critical_count
       FROM notifications WHERE user_id = ? AND is_read = 0`,
      [req.user.id]
    );
    const [[latest]] = await pool.query(
      'SELECT COALESCE(MAX(id), 0) AS latest_id FROM notifications WHERE user_id = ?',
      [req.user.id]
    );

    res.json({
      notifications: rows,
      unread_count: Number(counts.unread_count) || 0,
      critical_count: Number(counts.critical_count) || 0,
      latest_id: Number(latest.latest_id) || 0,
    });
  })
);

/* ---------------------------------------------------------------------------
   تغيير الحالة

   في حالتين مختلفتين عمدًا:
     is_read    = المستخدم شاف الإشعار
     handled_at = المستخدم **اتصرف**
   المتابع لما يشوف بلاغ "الدوا خلص" ده مش معناه إنه جاب الدوا. الفرق ده هو
   اللي بيخلي شاشة الإشعارات تفرق بين "قريتها" و"خلصتها".
   --------------------------------------------------------------------------- */

router.post(
  '/:id/read',
  authRequired,
  asyncHandler(async (req, res) => {
    // شرط user_id مش زيادة: هو اللي بيمنع مستخدم إنه يعدّل إشعار مستخدم تاني
    await pool.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [
      req.params.id,
      req.user.id,
    ]);
    res.json({ ok: true });
  })
);

router.post(
  '/read-all',
  authRequired,
  asyncHandler(async (req, res) => {
    await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
    res.json({ ok: true });
  })
);

router.post(
  '/:id/handled',
  authRequired,
  asyncHandler(async (req, res) => {
    await pool.query(
      'UPDATE notifications SET is_read = 1, handled_at = ? WHERE id = ? AND user_id = ?',
      [cairoNowString(), req.params.id, req.user.id]
    );
    res.json({ ok: true });
  })
);

/* ---------------------------------------------------------------------------
   إثبات التوصيل - بينادى من الـ Service Worker

   من غير تسجيل دخول عمدًا: الـ SW مش بيقدر يقرا localStorage فمعندوش توكن
   الدخول أصلاً. بدله بيبعت توكن موقّع جه مع الإشعار نفسه، ومالوش أي صلاحية
   غير تعليم الإشعار ده بالذات. التفاصيل في utils/actionToken.js.
   --------------------------------------------------------------------------- */
router.post(
  '/ack',
  asyncHandler(async (req, res) => {
    const { token, event } = req.body || {};
    const payload = verifyAck(token);
    if (!payload) return res.status(401).json({ error: 'توكن غير صالح' });
    if (event !== 'delivered' && event !== 'clicked') {
      return res.status(400).json({ error: 'حدث غير معروف' });
    }

    const column = event === 'delivered' ? 'delivered_at' : 'clicked_at';
    /* COALESCE: أول مرة بس هي اللي بتتسجّل. الإشعار الواحد ممكن يتعرض أكتر من
       مرة (أجهزة متعددة، أو المستخدم قفل الشريط وفتحه)، والمهم هنا "امتى وصل
       لأول مرة" مش آخر مرة. */
    await pool.query(
      `UPDATE notifications SET ${column} = COALESCE(${column}, ?) WHERE id = ?`,
      [cairoNowString(), payload.notificationId]
    );
    res.json({ ok: true });
  })
);

/* ---------------------------------------------------------------------------
   التفضيلات

   على السيرفر مش على الجهاز: قبل كده كل الإعدادات كانت في localStorage، يعني
   المتابع اللي بيغيّر موبايله بيرجع للإعدادات الافتراضية من غير ما يعرف.
   --------------------------------------------------------------------------- */

const PREF_BOOLS = ['push_enabled', 'pref_dose_due', 'pref_missed_dose', 'pref_appointment', 'pref_patient_issue'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

router.get(
  '/prefs',
  authRequired,
  asyncHandler(async (req, res) => {
    const prefs = await getPrefs(req.user.id);
    res.json({
      prefs: {
        ...prefs,
        // عمود TIME بيرجع "HH:MM:SS" - الواجهة بتستخدم input[type=time] اللي
        // بيتعامل بـ "HH:MM" بس، فبنقصّها هنا مرة واحدة بدل ما كل مكان يقصّها
        quiet_start: prefs.quiet_start ? String(prefs.quiet_start).slice(0, 5) : null,
        quiet_end: prefs.quiet_end ? String(prefs.quiet_end).slice(0, 5) : null,
      },
    });
  })
);

router.put(
  '/prefs',
  authRequired,
  asyncHandler(async (req, res) => {
    const current = await getPrefs(req.user.id);
    const body = req.body || {};

    // دمج المبعوت مع الموجود: الواجهة بتبعت المفتاح اللي اتغيّر بس
    const merged = { ...DEFAULT_PREFS, ...current };
    for (const key of PREF_BOOLS) {
      if (body[key] !== undefined) merged[key] = body[key] ? 1 : 0;
    }

    for (const key of ['quiet_start', 'quiet_end']) {
      if (body[key] === undefined) continue;
      if (body[key] === null || body[key] === '') {
        merged[key] = null;
      } else if (TIME_RE.test(body[key])) {
        merged[key] = body[key];
      } else {
        return res.status(400).json({ error: 'وقت الهدوء مش مكتوب صح' });
      }
    }

    /* ساعات الهدوء لازم تكون الاتنين أو ولا واحدة. بداية من غير نهاية معناها
       فترة مفتوحة للأبد - يعني إشعارات مقفولة بالكامل من غير ما المستخدم يقصد،
       وده بالظبط نوع الغلطة اللي بتخلي تذكير دوا ميوصلش. */
    if ((merged.quiet_start && !merged.quiet_end) || (!merged.quiet_start && merged.quiet_end)) {
      return res.status(400).json({ error: 'لازم تحدد بداية ونهاية ساعات الهدوء' });
    }

    await pool.query(
      `INSERT INTO notification_prefs
         (user_id, push_enabled, quiet_start, quiet_end,
          pref_dose_due, pref_missed_dose, pref_appointment, pref_patient_issue)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         push_enabled = VALUES(push_enabled),
         quiet_start = VALUES(quiet_start),
         quiet_end = VALUES(quiet_end),
         pref_dose_due = VALUES(pref_dose_due),
         pref_missed_dose = VALUES(pref_missed_dose),
         pref_appointment = VALUES(pref_appointment),
         pref_patient_issue = VALUES(pref_patient_issue)`,
      [
        req.user.id,
        merged.push_enabled,
        merged.quiet_start,
        merged.quiet_end,
        merged.pref_dose_due,
        merged.pref_missed_dose,
        merged.pref_appointment,
        merged.pref_patient_issue,
      ]
    );

    res.json({ ok: true, prefs: merged });
  })
);

module.exports = router;
