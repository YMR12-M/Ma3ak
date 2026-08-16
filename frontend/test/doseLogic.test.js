/* ============================================
   اختبار منطق توقيت الجرعات.

   قاعدة مهمة في الملف ده: ممنوع نستخدم أي حاجة بتعتمد على توقيت الجهاز اللي
   شغّال عليه التيست - يعني لا new Date('2026-08-15T17:44:00') (بتتفسّر بتوقيت
   الجهاز) ولا .getHours() (بترجع بتوقيت الجهاز).

   ليه: الكود اللي بنختبره مثبّت على توقيت مصر عمدًا، فلو التيست نفسه اتكتب
   بتوقيت الجهاز، هينجح على جهاز في مصر ويفشل على أي جهاز تاني - وده بالظبط
   اللي كان بيخلي الاختبارات دي تفشل على GitHub Actions (شغال UTC) وتنجح محليًا.

   بدل كده: بنبني "دلوقتي" من لحظة مطلقة بـ Z (UTC صريح)، وبنتحقق من النتيجة
   بعد ما نعرضها بتوقيت مصر - الطريقتين مالهمش أي علاقة بتوقيت الجهاز.
   ============================================ */
const test = require('node:test');
const assert = require('node:assert/strict');
const { getDoseAvailability, DOSE_EARLY_MINUTES } = require('../js/doseLogic');

// بيعرض لحظة مطلقة كساعة الحائط في مصر - "الساعة كام في مصر في اللحظة دي"
function cairoClock(date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/* مصر بتوقيت صيفي (+3) في أغسطس. الجرعة الساعة 18:00 بتوقيت مصر = 15:00 UTC،
   فالزرار بيفتح 17:45 مصر = 14:45 UTC. */
const SCHEDULED_SUMMER = '2026-08-15 18:00:00';

test('DOSE_EARLY_MINUTES = 15 دقيقة', () => {
  // backend/routes/doses.js بيستخدم نفس الملف ده مباشرة (require) بدل ما يكرر الرقم -
  // يعني التيست ده بيحمي القيمة نفسها لمصدر الحقيقة الوحيد، مش بس نسخة الفرونت إند.
  assert.equal(DOSE_EARLY_MINUTES, 15);
});

test('الزرار مقفول لو المتبقي على الميعاد أكتر من 15 دقيقة', () => {
  const now = new Date('2026-08-15T14:44:00Z'); // 17:44 بتوقيت مصر - فاضل 16 دقيقة
  assert.equal(getDoseAvailability(SCHEDULED_SUMMER, now).isEarly, true);
});

test('الزرار يفتح لما يتبقى بالظبط 15 دقيقة على الميعاد', () => {
  const now = new Date('2026-08-15T14:45:00Z'); // 17:45 بتوقيت مصر
  assert.equal(getDoseAvailability(SCHEDULED_SUMMER, now).isEarly, false);
});

test('الزرار مفتوح بالظبط في ميعاد الجرعة', () => {
  const now = new Date('2026-08-15T15:00:00Z'); // 18:00 بتوقيت مصر
  assert.equal(getDoseAvailability(SCHEDULED_SUMMER, now).isEarly, false);
});

test('الزرار يفضل مفتوح بعد ما ميعاد الجرعة يعدي (الباك إند هو اللي بيقفلها بـ missed)', () => {
  const now = new Date('2026-08-15T16:00:00Z'); // 19:00 بتوقيت مصر
  assert.equal(getDoseAvailability(SCHEDULED_SUMMER, now).isEarly, false);
});

test('availableFrom بيرجع بالظبط الميعاد ناقص 15 دقيقة (بتوقيت مصر)', () => {
  const { availableFrom } = getDoseAvailability(SCHEDULED_SUMMER, new Date('2026-08-15T00:00:00Z'));
  assert.equal(cairoClock(availableFrom), '17:45');
});

/* مصر رجّعت التوقيت الصيفي من 2023، فالفرق عن UTC بيتغير على مدار السنة:
   +3 في الصيف و +2 في الشتا. الاختبار ده بيتأكد إن الحساب بيمشي مع التغيير ده
   بدل ما يكون مربوط برقم ثابت - جرعة الساعة 18:00 في فبراير المفروض تفتح
   17:45 بتوقيت مصر برضه، مش 16:45 ولا 18:45. */
test('الحساب بيمشي مع التوقيت الشتوي كمان (+2 بدل +3)', () => {
  const scheduledWinter = '2026-02-15 18:00:00'; // 16:00 UTC في الشتا
  const { availableFrom, isEarly } = getDoseAvailability(
    scheduledWinter,
    new Date('2026-02-15T15:44:00Z') // 17:44 بتوقيت مصر - فاضل 16 دقيقة
  );
  assert.equal(cairoClock(availableFrom), '17:45');
  assert.equal(isEarly, true);
});
