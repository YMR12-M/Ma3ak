/* ============================================
   MA3ak (معاك) - منطق توقيت الجرعات (بدون JSX/React عمدًا)
   الملف ده منطق بحت بلا واجهة، عشان يشتغل في المتصفح (JavaScript عادي، من غير JSX)
   وفي Node وقت التيست (require) في نفس الوقت من غير أي تعديل.
   ============================================ */

// الزرار "خدت الدوا" مقفول لحد ما يفضل على ميعاد الجرعة ربع ساعة (مش قبل كده بكتير)،
// عشان المريض ما يأكدش جرعة قبل وقتها بساعات. بعد ما ميعادها يعدي، الباك إند بيحوّلها "فايتة"
// تلقائيًا (scheduler.js) فمفيش داعي نقفلها من بعد الميعاد كمان.
// ملحوظة: نفس الرقم متكرر في backend/routes/doses.js (DOSE_EARLY_MINUTES) - لازم يفضلوا متطابقين.
const DOSE_EARLY_MINUTES = 15;

/* ---------- أرقام المنبه ----------
   مشتركة بين الفرونت والباك إند من الملف ده عمدًا: الباك إند بيطبّقها كقاعدة
   (backend/routes/doses.js)، والفرونت بيرسم بيها الواجهة (كام غفوة فاضلة،
   الزرار مفتوح ولا لأ). لو اتنينهم عرّفوا نفس الرقم كل واحد لوحده، أول تعديل
   على واحد فيهم بيخلي الواجهة تقول حاجة والسيرفر يعمل حاجة تانية. */

// الغفوة بتأجّل الرنة، مش بتلغي الجرعة
const SNOOZE_MINUTES = 10;
// سقف الغفوات لكل جرعة. من غير سقف، "فكّرني بعدين" بتتحول لطريقة مريحة
// لتفويت الجرعة بالكامل - وده عكس الغرض من التطبيق كله.
const MAX_SNOOZES = 3;

/* لحد إمتى ينفع المريض يسجّل جرعة **بعد** ما تتحسب فايتة.
   قبل كده الجرعة الفايتة كانت مقفولة نهائيًا: المريض يصحى على المنبه بعد نص
   ساعة، ياخد الدوا فعلاً، ويلاقي الزرار مش شغال - فالتطبيق يفضل مسجّل إنه
   فوّتها. ده مش تسجيل دقيق، ده تسجيل غلط. 12 ساعة سقف منطقي: بيغطي "نام على
   جرعة الليل وصحي الصبح" من غير ما يسمح بتعديل تاريخ أيام قديمة. */
const DOSE_LATE_TAKE_HOURS = 12;

const CAIRO_TZ = 'Africa/Cairo';

// scheduled_at مخزّن في قاعدة البيانات كنص خام "YYYY-MM-DD HH:MM:SS" من غير أي
// timezone - المفروض يتقرا دايمًا كـ"الساعة دي بتوقيت مصر"، مهما كان الجهاز اللي
// بيحسبها (متصفح المستخدم غالبًا مصر، لكن السيرفر (Render) وقاعدة البيانات
// (مستضافة على Railway) شغالين بتوقيتهم الخاص، غالبًا UTC). لو استخدمنا
// new Date(scheduledAt) العادي، النتيجة كانت هتختلف 2-3 ساعات حسب توقيت الجهاز
// اللي شغّلها - وده بالظبط السبب اللي كان بيخلي الجرعة تتحسب "فاتت" أو "لسه بدري"
// في وقت غلط. الدالة دي بتفسّر النص دايمًا كتوقيت مصر مهما كان مكان التشغيل.
function parseCairoDatetime(scheduledAt) {
  const [datePart, timePart] = String(scheduledAt).trim().split(/[ T]/);
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second] = (timePart || '00:00:00').split(':').map(Number);

  // تخمين أولي كـ UTC، بنستخدمه بس عشان نعرف فرق التوقيت الفعلي بين مصر
  // واليوتيسي في اللحظة القريبة دي (بيتغيّر مع التوقيت الصيفي، مصر بترجّعه من 2023)
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second || 0);
  const offsetMinutes = cairoOffsetMinutesAt(new Date(utcGuess));
  return new Date(utcGuess - offsetMinutes * 60000);
}

// فرق مصر عن UTC بالدقايق في لحظة معيّنة (+120 شتاءً / +180 صيفًا حاليًا)
function cairoOffsetMinutesAt(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CAIRO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  let hour = get('hour');
  if (hour === 24) hour = 0; // بعض المتصفحات بترجع 24 بدل 00 مع hour12:false
  const asIfUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return Math.round((asIfUtc - date.getTime()) / 60000);
}

function getDoseAvailability(scheduledAt, now) {
  const scheduled = parseCairoDatetime(scheduledAt);
  const availableFrom = new Date(scheduled.getTime() - DOSE_EARLY_MINUTES * 60000);
  // آخر لحظة ينفع فيها تتسجّل - حتى لو بقت "فايتة" رسميًا
  const availableUntil = new Date(scheduled.getTime() + DOSE_LATE_TAKE_HOURS * 3600000);
  return {
    availableFrom,
    availableUntil,
    isEarly: now < availableFrom,
    isTooLate: now > availableUntil,
  };
}

/* هل الجرعة دي تقبل غفوة دلوقتي؟ بيتنادى من الواجهة (تظهر الزرار ولا لأ)
   ومن السيرفر (يقبل الطلب ولا لأ) - نفس الشروط بالظبط في المكانين.
   dose لازم يكون فيه أعمدة الدواء كمان (is_critical / snooze_allowed)، زي ما
   استعلامات الـ scheduler بترجّعها بـ JOIN. */
function canSnoozeDose(dose) {
  if (!dose || dose.status !== 'pending') return false;
  if (dose.is_critical) return false;      // دواء توقيته حرج - الغفوة ممنوعة
  if (dose.snooze_allowed === 0 || dose.snooze_allowed === false) return false;
  return (dose.snooze_count || 0) < MAX_SNOOZES;
}

// UMD بسيط: في المتصفح الدوال بتبقى global عادي (زي أي سكريبت عادي)،
// وفي Node (تيست) بتتصدّر عن طريق module.exports.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DOSE_EARLY_MINUTES,
    DOSE_LATE_TAKE_HOURS,
    SNOOZE_MINUTES,
    MAX_SNOOZES,
    getDoseAvailability,
    canSnoozeDose,
    parseCairoDatetime,
    cairoOffsetMinutesAt,
  };
}
