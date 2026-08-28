/* ============================================
   MA3ak (معاك) - الشغل والنت قاطع

   ليه الملف ده موجود:
   أغلب جمهور التطبيق على بيانات موبايل ضعيفة أو متقطعة. من غير الطبقة دي كان
   بيحصل حاجتين، الاتنين وحشين:

     1. المريض يفتح التطبيق والنت واقع → **شاشة خطأ ومفيش أي جرعات**. هو عارف
        إن عنده دوا، والتطبيق اللي المفروض يفكّره بيقوله "حصل خطأ".
     2. المريض ياخد الدوا فعلاً ويدوس "خدت الدوا" والنت قاطع → **الضغطة تضيع
        خالص**. مفيش إعادة محاولة، والتطبيق يفضل مسجّل إنه فوّت الجرعة، والمتابع
        ياخد تنبيه إنها فاتت. ده أسوأ من إن الزرار ميشتغلش أصلاً - المريض فاكر
        إنه عمل اللازم.

   الحل هنا متعمّد إنه بسيط: نسخة من جرعات النهاردة في localStorage، وطابور
   للتسجيلات اللي مقدرتش تتبعت. مفيش IndexedDB ولا Background Sync - الأولى
   زيادة تعقيد لبيانات بالحجم ده، والتانية Safari مش بيدعمها أصلاً (وiOS جزء
   كبير من الجمهور).
   ============================================ */

const DOSES_CACHE_KEY = 'ma3ak_doses_cache';
const TAKE_QUEUE_KEY = 'ma3ak_take_queue';
const ISSUE_QUEUE_KEY = 'ma3ak_issue_queue';

// النسخة المحفوظة بتبوظ بعد كده - جرعات إمبارح أسوأ من مفيش جرعات
const DOSES_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/* كل الوصول للتخزين ملفوف: التصفّح الخاص في بعض المتصفحات بيرمي استثناء من
   جوه localStorage نفسها، وسقوط التطبيق كله عشان الكاش مش شغال ملوش معنى. */
function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* التخزين مقفول أو مليان - التطبيق بيكمّل شغل من غير كاش */
  }
}

/* ---------- نسخة جرعات النهاردة ---------- */

function cacheTodayDoses(patientId, doses) {
  writeJson(DOSES_CACHE_KEY, { patientId, at: Date.now(), doses });
}

// بيرجّع { doses, at } أو null لو مفيش نسخة صالحة للمريض ده
function readCachedTodayDoses(patientId) {
  const cached = readJson(DOSES_CACHE_KEY, null);
  if (!cached || cached.patientId !== patientId) return null;
  if (Date.now() - cached.at > DOSES_CACHE_MAX_AGE_MS) return null;
  return { doses: cached.doses, at: cached.at };
}

/* ---------- طابور "خدت الدوا" ---------- */

function readTakeQueue() {
  const queue = readJson(TAKE_QUEUE_KEY, []);
  return Array.isArray(queue) ? queue : [];
}

function queueTake(doseId) {
  const queue = readTakeQueue();
  if (queue.some((item) => item.doseId === doseId)) return; // اتضافت قبل كده
  queue.push({ doseId, at: Date.now() });
  writeJson(TAKE_QUEUE_KEY, queue);
}

function isTakeQueued(doseId) {
  return readTakeQueue().some((item) => item.doseId === doseId);
}

/* بيحاول يبعت كل اللي في الطابور. بيرجّع عدد اللي اتبعت بنجاح.

   409 معناها "الجرعة مسجّلة قبل كده" - وده **نجاح** من ناحية الطابور: الهدف
   كان إنها تتسجّل، وهي متسجّلة (يمكن من جهاز تاني أو من الإشعار). سيبها في
   الطابور معناه إنها تفضل تتعاد للأبد.
   403 كمان بتتشال: عدى وقت طويل أوي والسيرفر رفضها - إعادة المحاولة مش هتغيّر
   حاجة، والاحتفاظ بيها بيخلي الطابور يكبر بلا فايدة. */
async function flushTakeQueue() {
  const queue = readTakeQueue();
  if (!queue.length) return 0;

  const remaining = [];
  let sent = 0;

  for (const item of queue) {
    try {
      await api.takeDose(item.doseId);
      sent += 1;
    } catch (e) {
      if (e.status === 409 || e.status === 403 || e.status === 404) continue; // مش هتنفع تتعاد
      remaining.push(item); // النت لسه قاطع - نحتفظ بيها
    }
  }

  writeJson(TAKE_QUEUE_KEY, remaining);
  return sent;
}

/* ---------- طابور بلاغات "حصلت مشكلة؟" ----------

   الطابور ده كان ناقص، وده كان أغرب فرق في الملف: "خدت الدوا" محمية من انقطاع
   النت، و**"عايز حد يتصل بيه" لأ**. يعني أهم زرار في الشاشة وقت الأزمة كان
   أقل واحد محمي - المريض يدوس عليه، يشوف رسالة خطأ، ويفتكر إن محدش هييجي.

   ونفس المنطق المكتوب فوق بينطبق عليه أكتر: الضغطة اللي بتضيع أسوأ من الزرار
   اللي مش شغّال، لأن المريض فاكر إنه عمل اللازم. */

// بلاغ عدّى عليه أكتر من كده مبيتبعتش. "عايز حد يتصل بيه" اتبعت بعد 6 ساعات
// مش معلومة متأخرة - دي معلومة **مضلّلة**: بتستدعي المتابع لحالة خلصت من زمان،
// وبتخليه ياخد التنبيهات دي أقل جدية في المرة الجاية.
const ISSUE_QUEUE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

function readIssueQueue() {
  const queue = readJson(ISSUE_QUEUE_KEY, []);
  return Array.isArray(queue) ? queue : [];
}

/* مفيش منع تكرار هنا، بعكس طابور الجرعات: البلاغ فعل متعمّد من المريض، ولو
   بلّغ مرتين يبقى قصده يبلّغ مرتين (نفس القاعدة اللي في routes/patients.js). */
function queueIssue(patientId, issueType, medicationName) {
  const queue = readIssueQueue();
  queue.push({ patientId, issueType, medicationName: medicationName || null, at: Date.now() });
  writeJson(ISSUE_QUEUE_KEY, queue);
}

function queuedIssueCount() {
  return readIssueQueue().length;
}

async function flushIssueQueue() {
  const queue = readIssueQueue();
  if (!queue.length) return 0;

  const remaining = [];
  let sent = 0;

  for (const item of queue) {
    if (Date.now() - item.at > ISSUE_QUEUE_MAX_AGE_MS) continue; // بايت، بنسيبه
    try {
      await api.reportIssue(item.patientId, item.issueType, item.medicationName || undefined);
      sent += 1;
    } catch (e) {
      // 4xx = السيرفر رفضه لسبب مش هيتغيّر بإعادة المحاولة
      if (e.status && e.status >= 400 && e.status < 500) continue;
      remaining.push(item);
    }
  }

  writeJson(ISSUE_QUEUE_KEY, remaining);
  return sent;
}

/* كل اللي اتحبس وقت انقطاع النت. بيتنادى من شاشة المريض قبل تحميل البيانات
   وأول ما النت يرجع. عمرها ما بترمي: فشل الطابور مينفعش يمنع الشاشة من التحميل. */
async function flushOfflineQueue() {
  const [takes, issues] = await Promise.all([
    flushTakeQueue().catch(() => 0),
    flushIssueQueue().catch(() => 0),
  ]);
  return { takes, issues };
}

function isOnline() {
  // navigator.onLine بيقول "فيه شبكة" مش "فيه إنترنت فعلاً" - فبنستخدمه كإشارة
  // متفائلة بس، والاعتماد الحقيقي على فشل الطلب نفسه
  return navigator.onLine !== false;
}
