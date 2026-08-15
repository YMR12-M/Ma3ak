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

function getDoseAvailability(scheduledAt, now) {
  const scheduled = new Date(scheduledAt);
  const availableFrom = new Date(scheduled.getTime() - DOSE_EARLY_MINUTES * 60000);
  return { availableFrom, isEarly: now < availableFrom };
}

// UMD بسيط: في المتصفح الدوال بتبقى global عادي (زي أي سكريبت عادي)،
// وفي Node (تيست) بتتصدّر عن طريق module.exports.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DOSE_EARLY_MINUTES, getDoseAvailability };
}
