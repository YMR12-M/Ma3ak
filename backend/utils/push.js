/* ============================================
   MA3ak (معاك) - Web Push: توصيل الإشعار والتطبيق مقفول

   ليه الملف ده موجود:
   قبله كان الإشعار بيتكتب صف في جدول notifications وبس، والفرونت بيسأل عليه كل
   دقيقة - يعني لو التاب مقفول (وده الوضع الطبيعي 99% من الوقت) التذكير ببساطة
   مبيوصلش. ده كان أكبر فرق بين وعد التطبيق ("تذكير موثوق بمواعيد الدوا")
   وتنفيذه. Web Push هو القناة الوحيدة في المتصفح اللي بتوصل والتطبيق مقفول.

   إزاي بيشتغل باختصار:
   المتصفح بيسجّل نفسه عند "خدمة دفع" (خدمة جوجل لكروم، آبل لسفاري...) وبيدينا
   endpoint + مفتاحين تشفير. إحنا بنبعت الرسالة **مشفّرة** للـ endpoint ده،
   وخدمة الدفع توصّلها للمتصفح حتى لو مقفول، والـ Service Worker بيفكّها ويعرضها.
   مفاتيح VAPID هي إثبات هويتنا كسيرفر قدام خدمة الدفع.

   قيود لازم تتعرف:
   - **iOS/Safari بيدعم Web Push بس لو التطبيق متثبت على الشاشة الرئيسية.**
     في المتصفح العادي مفيش دعم خالص - مش قصور فينا، ده قرار من آبل. عشان كده
     بانر "ثبّت التطبيق" في الواجهة مش رفاهية.
   - الاشتراكات بتموت لوحدها (المستخدم مسح بيانات الموقع، أو الجهاز اتغيّر).
     خدمة الدفع بترد وقتها 404 أو 410، والصف لازم يتمسح فورًا - لو سبناه
     الجدول بيتلوث ونفضل نحاول نبعت لأجهزة مش موجودة.
   - الـ push بيدّي إشعار، **مش صوت مستمر**. الرنة الحقيقية بتحصل بس لما التطبيق
     يكون مفتوح (شاشة المنبه في PatientHome).

   لو مفيش مفاتيح VAPID في .env: الملف ده بيشتغل في "وضع معطّل" - بيسجّل تحذير
   مرة واحدة وبيرجع صفر مرسل. التطبيق كله بيفضل شغال عادي (الإشعارات بتتخزن في
   قاعدة البيانات وبتبان جوه التطبيق زي الأول)، بس من غير دفع خارجي.
   ============================================ */

const webpush = require('web-push');
const pool = require('../db');
const { cairoNowString } = require('./time');

// بعد كام فشل متتالي (مش 404/410) نعتبر الاشتراك ميت ونشيله. الفشل المؤقت
// (خدمة الدفع مضغوطة، الشبكة وقعت) بيحصل عادي، فمش أول فشل بنمسح.
const MAX_FAILURES = 5;

const publicKey = process.env.VAPID_PUBLIC_KEY || '';
const privateKey = process.env.VAPID_PRIVATE_KEY || '';
// خدمات الدفع بتطلب وسيلة تواصل معانا (mailto: أو https:) عشان تقدر تبلّغنا
// لو سيرفرنا بيبعت غلط - مش اختياري في المواصفة.
const subject = process.env.VAPID_SUBJECT || 'mailto:support@ma3ak.app';

let enabled = false;
if (publicKey && privateKey) {
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    enabled = true;
  } catch (e) {
    console.error('❌ مفاتيح VAPID مش صالحة - الدفع اتعطّل:', e.message);
  }
} else {
  console.warn(
    '⚠️  VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY مش موجودين في .env - إشعارات الدفع معطّلة.\n' +
      '   التطبيق هيشتغل عادي بس التذكير مش هيوصل والتطبيق مقفول.\n' +
      '   ولّد مفاتيح بالأمر:  npx web-push generate-vapid-keys'
  );
}

function isPushEnabled() {
  return enabled;
}

function getPublicKey() {
  return enabled ? publicKey : null;
}

/* بيبعت رسالة واحدة لكل أجهزة مستخدم معيّن.

   بيرجع { sent, removed, failed } - عدد الأجهزة اللي وصلها فعلاً، الاشتراكات
   الميتة اللي اتشالت في الطريق، والفشل المؤقت اللي لسه بنحاول معاه. التلاتة
   منفصلين عشان زرار "ابعت تنبيه تجريبي" يقدر يقول للمستخدم حصل إيه بالظبط -
   "مفيش أجهزة" حاجة و"الاشتراك بطل" حاجة تانية خالص. بيبعت لكل الأجهزة بالتوازي (Promise.allSettled)
   لأن جهاز بطيء أو خدمة دفع واقعة مالهاش لازمة تعطّل باقي الأجهزة.

   الدالة دي عمرها ما بترمي استثناء: فشل الدفع مش سبب كافي إن دورة الـ scheduler
   كلها تقف، ولا إن طلب API يفشل على المستخدم. */
async function sendToUser(userId, payload) {
  if (!enabled) return { sent: 0, removed: 0, failed: 0 };

  const [subs] = await pool.query('SELECT * FROM push_subscriptions WHERE user_id = ?', [userId]);
  if (!subs.length) return { sent: 0, removed: 0, failed: 0 };

  const body = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        {
          // TTL: قد إيه خدمة الدفع تفضل ماسكة الرسالة لو الجهاز مقفول. تذكير
          // بجرعة مالوش لازمة بعد ساعة - أحسن ميوصلش من إنه يوصل متأخر ويلخبط.
          TTL: payload.ttl || 3600,
          urgency: payload.priority === 'critical' ? 'high' : 'normal',
        }
      )
    )
  );

  let sent = 0;
  let removed = 0;
  let failed = 0;

  for (let i = 0; i < results.length; i += 1) {
    const sub = subs[i];
    const r = results[i];

    if (r.status === 'fulfilled') {
      sent += 1;
      await pool
        .query('UPDATE push_subscriptions SET fail_count = 0, last_success_at = ? WHERE id = ?', [
          cairoNowString(),
          sub.id,
        ])
        .catch(() => {});
      continue;
    }

    const status = r.reason && r.reason.statusCode;
    /* 404 / 410 = الاشتراك ده مات نهائيًا عند خدمة الدفع (المستخدم مسح بيانات
       الموقع، شال التطبيق، أو الجهاز اتغيّر). ده مش خطأ مؤقت - محاولة تانية
       عمرها ما هتنجح، فبنشيله على طول بدل ما نفضل نضرب على عنوان ميت. */
    if (status === 404 || status === 410) {
      await pool.query('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]).catch(() => {});
      removed += 1;
      continue;
    }

    // فشل مؤقت: بنعدّ، ولما يوصل الحد بنعتبره ميت
    const nextFailCount = (sub.fail_count || 0) + 1;
    if (nextFailCount >= MAX_FAILURES) {
      await pool.query('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]).catch(() => {});
      removed += 1;
    } else {
      failed += 1;
      await pool
        .query('UPDATE push_subscriptions SET fail_count = ? WHERE id = ?', [nextFailCount, sub.id])
        .catch(() => {});
    }
  }

  return { sent, removed, failed };
}

module.exports = { isPushEnabled, getPublicKey, sendToUser, MAX_FAILURES };
