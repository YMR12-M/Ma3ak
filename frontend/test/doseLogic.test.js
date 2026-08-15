const test = require('node:test');
const assert = require('node:assert/strict');
const { getDoseAvailability, DOSE_EARLY_MINUTES } = require('../js/doseLogic');

test('DOSE_EARLY_MINUTES = 15 دقيقة', () => {
  // backend/routes/doses.js بيستخدم نفس الملف ده مباشرة (require) بدل ما يكرر الرقم -
  // يعني التيست ده بيحمي القيمة نفسها لمصدر الحقيقة الوحيد، مش بس نسخة الفرونت إند.
  assert.equal(DOSE_EARLY_MINUTES, 15);
});

test('الزرار مقفول لو المتبقي على الميعاد أكتر من 15 دقيقة', () => {
  const scheduled = '2026-08-15 18:00:00';
  const now = new Date('2026-08-15T17:44:00');
  const { isEarly } = getDoseAvailability(scheduled, now);
  assert.equal(isEarly, true);
});

test('الزرار يفتح لما يتبقى بالظبط 15 دقيقة على الميعاد', () => {
  const scheduled = '2026-08-15 18:00:00';
  const now = new Date('2026-08-15T17:45:00');
  const { isEarly } = getDoseAvailability(scheduled, now);
  assert.equal(isEarly, false);
});

test('الزرار مفتوح بالظبط في ميعاد الجرعة', () => {
  const scheduled = '2026-08-15 18:00:00';
  const now = new Date('2026-08-15T18:00:00');
  const { isEarly } = getDoseAvailability(scheduled, now);
  assert.equal(isEarly, false);
});

test('الزرار يفضل مفتوح بعد ما ميعاد الجرعة يعدي (الباك إند هو اللي بيقفلها بـ missed)', () => {
  const scheduled = '2026-08-15 18:00:00';
  const now = new Date('2026-08-15T19:00:00');
  const { isEarly } = getDoseAvailability(scheduled, now);
  assert.equal(isEarly, false);
});

test('availableFrom بيرجع بالظبط الميعاد ناقص 15 دقيقة', () => {
  const scheduled = '2026-08-15 18:00:00';
  const { availableFrom } = getDoseAvailability(scheduled, new Date('2026-08-15T00:00:00'));
  assert.equal(availableFrom.getHours(), 17);
  assert.equal(availableFrom.getMinutes(), 45);
});
