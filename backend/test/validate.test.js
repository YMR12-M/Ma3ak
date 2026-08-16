/* اختبار طبقة التحقق من المدخلات - هي اللي بتمنع القيم الغلط إنها توصل لقاعدة
   البيانات. كل حالة هنا كانت فعليًا بتوقّع السيرفر بالكامل قبل كده (خطأ من
   MySQL جوه دالة async من غير ما حد يمسكه)، فالاختبارات دي مش شكليات - كل
   واحد فيهم بيحمي من انقطاع خدمة حقيقي. */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isValidTime,
  isValidDate,
  isValidDateTime,
  normalizeDateTime,
  validateTimes,
  isNonEmptyString,
  isTooLong,
  LIMITS,
} = require('../utils/validate');

test('isValidTime: بيقبل الساعات الحقيقية بس', () => {
  for (const ok of ['00:00', '08:00', '13:45', '23:59']) {
    assert.equal(isValidTime(ok), true, `${ok} المفروض يتقبل`);
  }
  // "25:99" كان بيتقبل قبل كده وبيتحول لجرعة في يوم وساعة غلط تمامًا
  for (const bad of ['25:99', '24:00', '8:00', '08:0', '', '99:99', 'مش وقت', null, undefined, 5]) {
    assert.equal(isValidTime(bad), false, `${bad} المفروض يترفض`);
  }
});

test('isValidDate: بيرفض التواريخ اللي شكلها سليم بس مش موجودة', () => {
  assert.equal(isValidDate('2026-08-16'), true);
  assert.equal(isValidDate('2024-02-29'), true); // سنة كبيسة حقيقية
  assert.equal(isValidDate('2026-02-30'), false); // شكله سليم، بس اليوم ده مش موجود
  assert.equal(isValidDate('2026-13-01'), false);
  assert.equal(isValidDate('2025-02-29'), false); // 2025 مش كبيسة
  assert.equal(isValidDate('مش تاريخ'), false);
  assert.equal(isValidDate(''), false);
});

test('isValidDateTime: بيقبل صيغة قاعدة البيانات وصيغة datetime-local', () => {
  assert.equal(isValidDateTime('2026-08-16 20:00:00'), true);
  assert.equal(isValidDateTime('2026-08-16T20:00'), true); // اللي بيبعته input[type=datetime-local]
  assert.equal(isValidDateTime('2026-08-16 25:00:00'), false);
  assert.equal(isValidDateTime('2026-08-16'), false); // ناقصه الساعة
  assert.equal(isValidDateTime('مش تاريخ خالص'), false);
});

test('normalizeDateTime: بيوحّد كل الصيغ لصيغة MySQL', () => {
  assert.equal(normalizeDateTime('2026-08-16T20:00'), '2026-08-16 20:00:00');
  assert.equal(normalizeDateTime('2026-08-16 20:00:00'), '2026-08-16 20:00:00');
});

test('validateTimes: بيرفض المصفوفة الفاضية والقيم الغلط والتكرار', () => {
  assert.equal(validateTimes(['08:00', '20:00']), null); // سليمة
  assert.notEqual(validateTimes([]), null);
  assert.notEqual(validateTimes(null), null);
  assert.notEqual(validateTimes('08:00'), null); // مش مصفوفة
  assert.notEqual(validateTimes([{ a: 1 }]), null); // أوبجكت بدل نص - كان بيتقبل وميولّدش جرعات خالص
  assert.notEqual(validateTimes(['25:99']), null);
  assert.notEqual(validateTimes(['08:00', '08:00']), null); // مكرر
  assert.notEqual(validateTimes(new Array(LIMITS.maxTimesPerMed + 1).fill('08:00')), null);
});

test('isNonEmptyString: مسافات لوحدها مش اسم', () => {
  assert.equal(isNonEmptyString('أحمد'), true);
  assert.equal(isNonEmptyString('   '), false);
  assert.equal(isNonEmptyString(''), false);
  assert.equal(isNonEmptyString(null), false);
  assert.equal(isNonEmptyString(123), false);
});

test('isTooLong: الحدود مطابقة لأعمدة قاعدة البيانات', () => {
  assert.equal(isTooLong('ا'.repeat(LIMITS.medName), LIMITS.medName), false); // بالظبط الحد
  assert.equal(isTooLong('ا'.repeat(LIMITS.medName + 1), LIMITS.medName), true); // حرف زيادة
});
