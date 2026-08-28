/* ============================================
   MA3ak (معاك) - المكان الوحيد اللي بيتولد منه أي إشعار

   قبل الملف ده كان كل مكان في الكود بيعمل INSERT بإيده في جدول notifications،
   وكل واحد فيهم بينسى حاجة مختلفة: التكرار، الأولوية، تفضيلات المستخدم، الدفع.
   دلوقتي أي إشعار في التطبيق بيعدّي من هنا، فأي قاعدة بتتطبق على الكل مرة واحدة.

   ---------- قواعد التفضيلات (مهم تفهمها قبل ما تعدّل) ----------
   فيه تفرقة مقصودة بين حاجتين:
     • **السجل جوه التطبيق** (صف في notifications) - بيتخزن **دايمًا**. تفضيلات
       المستخدم بتتحكم في المقاطعة، مش في إن السجل يبقى ناقص. المتابع لما يفتح
       شاشة الإشعارات لازم يلاقي كل اللي حصل، حتى اللي ما رنّش عنده.
     • **الدفع للجهاز** (Web Push) - ده اللي بيتقفل بالتفضيلات.

   والتفضيلات تلاتة مستويات:
     1. push_enabled = 0  → مفتاح رئيسي. بيقفل الدفع كله، **حتى الحرج**. لو
        المستخدم قال "مش عايز إشعارات على الجهاز ده خالص" ده قراره.
     2. تفضيل النوع (pref_missed_dose...) → بيتخطى لو الإشعار priority='critical'.
     3. ساعات الهدوء → بتتخطى برضه لو الإشعار حرج.

   يعني: **critical عمره ما بيتأجل بليل ولا بيتقفل بنوعه** - ده بالظبط الفرق بين
   تطبيق "مفكّرة" وتطبيق "شبكة أمان". جرعة أنسولين فاتت مش هتستنى الصبح.
   ============================================ */

const pool = require('../db');
/* بنستورد الموديول ككائن مش بنفكّك دواله (destructuring) عن قصد: التفكيك
   بيثبّت الدالة وقت التحميل، فمبقاش ينفع تتبدّل في التيست - والقواعد اللي
   تحت (مين بياخد دفع ومين لأ) هي بالظبط اللي عايزين نختبرها من غير ما
   نحتاج مفاتيح VAPID حقيقية ولا شبكة. */
const pushService = require('./push');
const { signAck } = require('./actionToken');
const { cairoNowString, cairoClockNow } = require('./time');

/* أنهي تفضيل بيتحكم في أنهي نوع. أكتر من نوع ممكن يشتركوا في تفضيل واحد عمدًا:
   المستخدم مش عايز يظبط 7 مفاتيح - "تنبيهات الجرعات" مفتاح واحد يغطي وصول
   الميعاد والتذكير اللي بعده. */
const TYPE_PREF_COLUMN = {
  dose_due: 'pref_dose_due',
  dose_reminder: 'pref_dose_due',
  missed_dose: 'pref_missed_dose',
  dose_escalation: 'pref_missed_dose',
  upcoming_appointment: 'pref_appointment',
  patient_issue: 'pref_patient_issue',
  general: null, // مفيش مفتاح ليه - إشعارات النظام بتوصل دايمًا
};

// اللي بيتطبق على مستخدم لسه معملش صف في notification_prefs. الافتراضي "كله
// شغال، من غير ساعات هدوء" - المستخدم اللي لسه مدخلش الإعدادات عايز التطبيق
// يفكّره، مش يفضل ساكت.
const DEFAULT_PREFS = {
  push_enabled: 1,
  quiet_start: null,
  quiet_end: null,
  pref_dose_due: 1,
  pref_missed_dose: 1,
  pref_appointment: 1,
  pref_patient_issue: 1,
};

async function getPrefs(userId) {
  const [rows] = await pool.query('SELECT * FROM notification_prefs WHERE user_id = ?', [userId]);
  if (!rows.length) return { ...DEFAULT_PREFS, user_id: userId };
  return rows[0];
}

/* "HH:MM:SS" (زي ما عمود TIME بيرجع) أو "HH:MM" → دقايق من نص الليل.
   بنقارن بالدقايق مش بالنصوص عشان نقدر نتعامل مع الفترة اللي بتعدّي منتصف الليل. */
function toMinutes(value) {
  if (!value) return null;
  const [h, m] = String(value).slice(0, 5).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/* هل دلوقتي جوه ساعات الهدوء؟

   الفترة الطبيعية هنا بتعدّي منتصف الليل (22:00 → 07:00)، وده بالظبط اللي
   المقارنة النصية البسيطة بتفشل فيه: "23:30" مش أصغر من "07:00" ولا أكبر من
   "22:00" و"07:00" مع بعض. فبنفرّق بين الحالتين صراحة. */
function isWithinQuietHours(prefs, clockNow = cairoClockNow()) {
  const start = toMinutes(prefs.quiet_start);
  const end = toMinutes(prefs.quiet_end);
  if (start === null || end === null || start === end) return false;

  const now = toMinutes(clockNow);
  if (start < end) return now >= start && now < end; // فترة عادية جوه نفس اليوم
  return now >= start || now < end; // فترة بتعدّي منتصف الليل
}

/* بيقرر: الإشعار ده يتبعت دفع للجهاز ولا لأ، وليه.
   بيرجع { push: boolean, reason: string } - السبب بيتسجّل في اللوج عشان لما
   حد يقول "التنبيه مجاليش" نعرف نجاوب من غير تخمين. */
function shouldPush(prefs, type, priority) {
  if (!pushService.isPushEnabled()) return { push: false, reason: 'push-disabled-server' };
  if (!prefs.push_enabled) return { push: false, reason: 'push-off-by-user' };

  const isCritical = priority === 'critical';

  const prefColumn = TYPE_PREF_COLUMN[type];
  if (prefColumn && !prefs[prefColumn] && !isCritical) {
    return { push: false, reason: `type-off:${type}` };
  }
  if (isWithinQuietHours(prefs) && !isCritical) {
    return { push: false, reason: 'quiet-hours' };
  }
  return { push: true, reason: 'ok' };
}

/* بيعمل إشعار واحد لمستخدم واحد: بيخزّنه، وبيبعته دفع لو مسموح.

   بيرجع:
     null                     → اتمنع كتكرار (نفس dedupeKey اتسجّل قبل كده)
     { id, pushed, reason }   → اتسجّل؛ pushed بيقول وصل جهاز فعلاً ولا لأ

   ملحوظة على منع التكرار: بنعتمد على UNIQUE (user_id, dedupe_key) في قاعدة
   البيانات مع INSERT IGNORE، مش على SELECT-ثم-INSERT زي ما كان قبل كده.
   الفرق مش شكلي: الطريقة القديمة فيها سباق حقيقي - دورتين scheduler متداخلتين
   (أو نسختين من السيرفر) كانوا ممكن يقروا "مفيش" في نفس اللحظة ويدخّلوا
   الاتنين. القيد في قاعدة البيانات هو الحاجة الوحيدة اللي بتمنع ده فعلاً. */
async function createNotification({
  userId,
  patientId,
  type,
  priority = 'normal',
  message,
  relatedId = null,
  dedupeKey = null,
  push = null, // { title, body, tag, url, actions, ttl } - لو null بيتبني تلقائي من message
}) {
  const [result] = await pool.query(
    `INSERT IGNORE INTO notifications
       (user_id, patient_id, type, priority, related_id, dedupe_key, message)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, patientId, type, priority, relatedId, dedupeKey, String(message).slice(0, 255)]
  );

  // affectedRows = 0 معناه إن الـ UNIQUE منع الإدخال - الإشعار ده اتبعت قبل كده
  if (!result.affectedRows) return null;
  const notificationId = result.insertId;

  const prefs = await getPrefs(userId);
  const decision = shouldPush(prefs, type, priority);
  if (!decision.push) return { id: notificationId, pushed: false, reason: decision.reason };

  const payload = {
    notificationId,
    type,
    priority,
    title: (push && push.title) || 'معاك',
    body: (push && push.body) || message,
    // tag بيخلي إشعار جديد **يحل محل** القديم بنفس الوسم بدل ما يتكدّسوا فوق
    // بعض في شريط الإشعارات. تذكير الجرعة التاني المفروض يستبدل الأول، مش
    // يزوّد صف تاني على مريض بيتلخبط أصلاً من كتر الحاجات على الشاشة.
    tag: (push && push.tag) || `notif-${notificationId}`,
    url: (push && push.url) || '/',
    actions: (push && push.actions) || [],
    data: (push && push.data) || {},
    // بيخلي الـ Service Worker يقدر يقول للسيرفر "وصل" و"اتداس عليه" من غير
    // ما يحتاج توكن دخول (هو مش شايفه أصلاً) - شوف utils/actionToken.js
    ackToken: signAck(notificationId),
    ttl: push && push.ttl,
  };

  let pushed = false;
  try {
    const { sent } = await pushService.sendToUser(userId, payload);
    pushed = sent > 0;
    if (pushed) {
      await pool.query('UPDATE notifications SET push_sent_at = ? WHERE id = ?', [
        cairoNowString(),
        notificationId,
      ]);
    }
  } catch (e) {
    // فشل الدفع مبيوقّفش أي حاجة: الإشعار متسجّل في قاعدة البيانات، والمستخدم
    // هيشوفه جوه التطبيق. اللوج هو اللي بيخلينا نعرف إن فيه مشكلة توصيل.
    console.error('notify: push failed:', e.message);
  }

  return { id: notificationId, pushed, reason: decision.reason };
}

// كل المتابعين المرتبطين بمريض معيّن
async function getCaregiverIds(patientId) {
  const [rows] = await pool.query(
    'SELECT caregiver_id FROM patient_caregiver WHERE patient_id = ?',
    [patientId]
  );
  return rows.map((r) => r.caregiver_id);
}

// المريض نفسه + كل متابعينه
async function getCircleIds(patientId) {
  return [Number(patientId), ...(await getCaregiverIds(patientId))];
}

/* بيبعت نفس الإشعار لأكتر من مستخدم. dedupeKey بيتوحّد لكل المستلمين لأن
   القيد UNIQUE مركّب على (user_id, dedupe_key) - يعني نفس المفتاح لمستخدمين
   مختلفين بيعدّي عادي، وبيمنع التكرار على مستوى المستخدم الواحد بس. */
async function notifyUsers(userIds, options) {
  const results = [];
  for (const userId of userIds) {
    try {
      const r = await createNotification({ ...options, userId });
      if (r) results.push(r);
    } catch (e) {
      console.error(`notify: failed for user ${userId}:`, e.message);
    }
  }
  return results;
}

module.exports = {
  createNotification,
  notifyUsers,
  getCaregiverIds,
  getCircleIds,
  getPrefs,
  isWithinQuietHours,
  shouldPush,
  DEFAULT_PREFS,
  TYPE_PREF_COLUMN,
};
