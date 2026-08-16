/* ============================================
   MA3ak (معاك) - منطق توقيت الجرعات (بدون JSX/React عمدًا)
   الملف ده منطق بحت بلا واجهة، عشان يشتغل في المتصفح (سكريبت عادي، بدون Babel)
   وفي Node وقت التيست (require) في نفس الوقت من غير أي تعديل.
   ============================================ */

// الزرار "خدت الدوا" مقفول لحد ما يفضل على ميعاد الجرعة ربع ساعة (مش قبل كده بكتير)،
// عشان المريض ما يأكدش جرعة قبل وقتها بساعات. بعد ما ميعادها يعدي، الباك إند بيحوّلها "فايتة"
// تلقائيًا (scheduler.js) فمفيش داعي نقفلها من بعد الميعاد كمان.
// ملحوظة: نفس الرقم متكرر في backend/routes/doses.js (DOSE_EARLY_MINUTES) - لازم يفضلوا متطابقين.
const DOSE_EARLY_MINUTES = 15;

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
  return { availableFrom, isEarly: now < availableFrom };
}

// UMD بسيط: في المتصفح الدوال بتبقى global عادي (زي أي سكريبت عادي)،
// وفي Node (تيست) بتتصدّر عن طريق module.exports.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DOSE_EARLY_MINUTES, getDoseAvailability, parseCairoDatetime, cairoOffsetMinutesAt };
}
