/* ============================================
   اختبار فترات اليوم والتحية ونتيجة الحيط.

   نفس قاعدة doseLogic.test.js: ممنوع أي حاجة بتعتمد على توقيت الجهاز اللي
   شغّال عليه التيست. "الساعة المكتوبة" بتتقرا من النص نفسه (مفيش تحويل)، و"دلوقتي"
   بنبنيه من لحظة مطلقة بـ Z وبنتحقق منها بتوقيت مصر.
   ============================================ */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DAY_PARTS,
  dayPartKeyOfHour,
  hourOfTimeString,
  dayPartOfTime,
  cairoHourOf,
  greetingOfHour,
  leafParts,
} = require('../js/dayParts');

test('حدود فترات اليوم: كل ساعة في فترتها، والنهايات مستثناة', () => {
  const expected = {
    0: 'night', 4: 'night',
    5: 'morning', 11: 'morning',
    12: 'noon', 16: 'noon',
    17: 'evening', 21: 'evening',
    22: 'night', 23: 'night',
  };
  for (const [hour, key] of Object.entries(expected)) {
    assert.equal(dayPartKeyOfHour(Number(hour)), key, `الساعة ${hour}`);
  }
});

test('الساعة بتتقرا من كل صيغ الميعاد اللي في التطبيق', () => {
  assert.equal(hourOfTimeString('08:30'), 8);
  assert.equal(hourOfTimeString('2026-10-04 18:15:00'), 18);
  assert.equal(hourOfTimeString('2026-10-04T22:30'), 22);
  assert.equal(hourOfTimeString('9:05'), 9);
});

test('صيغة مش مفهومة: بترجع null بدل ما تكسر', () => {
  assert.equal(hourOfTimeString(''), null);
  assert.equal(hourOfTimeString(null), null);
  assert.equal(hourOfTimeString('بكرة'), null);
});

test('dayPartOfTime بيرجّع الفترة كاملة (كلمة + أيقونة)، والصبح هو الافتراضي', () => {
  assert.equal(dayPartOfTime('2026-10-04 08:00:00'), DAY_PARTS.morning);
  assert.equal(dayPartOfTime('14:00'), DAY_PARTS.noon);
  assert.equal(dayPartOfTime('2026-10-04 18:17:00').label, 'المسا');
  assert.equal(dayPartOfTime('23:30').icon, 'moon');
  assert.equal(dayPartOfTime('???'), DAY_PARTS.morning);
});

test('الساعة بتوقيت مصر مش بتوقيت الجهاز', () => {
  // مصر +3 صيفًا: 15:00 UTC = 18:00 القاهرة، و22:30 UTC = 01:30 اليوم التالي
  assert.equal(cairoHourOf(new Date('2026-08-15T15:00:00Z')), 18);
  assert.equal(cairoHourOf(new Date('2026-08-15T22:30:00Z')), 1);
  // وشتاءً +2: 15:00 UTC = 17:00 القاهرة
  assert.equal(cairoHourOf(new Date('2026-01-15T15:00:00Z')), 17);
});

test('التحية بتتغيّر مع الوقت', () => {
  assert.equal(greetingOfHour(5), 'صباح الخير');
  assert.equal(greetingOfHour(11), 'صباح الخير');
  assert.equal(greetingOfHour(12), 'مساء الخير');
  assert.equal(greetingOfHour(21), 'مساء الخير');
  assert.equal(greetingOfHour(22), 'أهلاً');
  assert.equal(greetingOfHour(3), 'أهلاً');
});

test('نتيجة الحيط: يوم وشهر واسم يوم بتوقيت مصر، بأرقام هندية', () => {
  // 2026-10-04 هو يوم أحد. 21:30 UTC = 00:30 يوم 5 بتوقيت مصر - فاليوم لازم يكون ٥ مش ٤.
  const late = leafParts(new Date('2026-10-04T21:30:00Z'));
  assert.equal(late.day, '٥');
  assert.equal(late.weekday, 'الإتنين');
  assert.equal(late.month, 'أكتوبر');
  assert.equal(late.year, '٢٠٢٦');

  const noon = leafParts(new Date('2026-10-04T09:00:00Z'));
  assert.equal(noon.day, '٤');
  assert.equal(noon.weekday, 'الأحد');
});
