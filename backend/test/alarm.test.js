/* اختبار منطق المنبه: الغفوة، ونافذة التسجيل المتأخر.

   الأرقام دي مشتركة بين الفرونت والباك إند (frontend/js/doseLogic.js): الواجهة
   بترسم بيها الزراير، والسيرفر بيطبّقها كقاعدة. لو اتنينهم اختلفوا، المريض
   بيشوف زرار بيدوس عليه فيرجعله رفض - وده أسوأ من إن الزرار ما يبانش أصلاً. */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getDoseAvailability,
  canSnoozeDose,
  MAX_SNOOZES,
  DOSE_EARLY_MINUTES,
  DOSE_LATE_TAKE_HOURS,
  parseCairoDatetime,
} = require('../../frontend/js/doseLogic');

const { signDoseAction, verifyDoseAction, signAck, verifyAck } = require('../utils/actionToken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-'.padEnd(40, 'x');

// ميعاد بتوقيت مصر ككائن Date، عشان نبني منه "دلوقتي" بفروق دقايق مضبوطة
const SCHEDULED = '2026-08-27 20:00:00';
const scheduledDate = parseCairoDatetime(SCHEDULED);
const at = (minutesFromScheduled) =>
  new Date(scheduledDate.getTime() + minutesFromScheduled * 60000);

/* ---------- نافذة التسجيل ---------- */

test('قبل الميعاد بأكتر من ربع ساعة: لسه بدري', () => {
  const a = getDoseAvailability(SCHEDULED, at(-DOSE_EARLY_MINUTES - 1));
  assert.equal(a.isEarly, true);
  assert.equal(a.isTooLate, false);
});

test('جوه ربع الساعة اللي قبل الميعاد: الزرار بيفتح', () => {
  assert.equal(getDoseAvailability(SCHEDULED, at(-DOSE_EARLY_MINUTES + 1)).isEarly, false);
});

/* التأكيد ده هو الإصلاح الأساسي: قبله الجرعة بعد نص ساعة كانت بتتقفل نهائيًا،
   فالمريض اللي بيصحى على المنبه متأخر وياخد الدوا فعلاً كان بيلاقي الزرار مش
   شغال - والتطبيق يفضل مسجّل إنه فوّتها. */
test('بعد ما تتحسب "فايتة" بساعات، لسه ينفع تتسجّل', () => {
  const a = getDoseAvailability(SCHEDULED, at(60)); // بعد ساعة
  assert.equal(a.isEarly, false);
  assert.equal(a.isTooLate, false);
});

test('بعد نافذة التأخير كلها: مش هينفع تتسجّل', () => {
  const a = getDoseAvailability(SCHEDULED, at(DOSE_LATE_TAKE_HOURS * 60 + 1));
  assert.equal(a.isTooLate, true);
});

test('آخر لحظة في النافذة لسه مقبولة', () => {
  assert.equal(getDoseAvailability(SCHEDULED, at(DOSE_LATE_TAKE_HOURS * 60 - 1)).isTooLate, false);
});

/* ---------- الغفوة ---------- */

const dose = (over = {}) => ({
  status: 'pending',
  is_critical: 0,
  snooze_allowed: 1,
  snooze_count: 0,
  ...over,
});

test('جرعة عادية مستنية: الغفوة متاحة', () => {
  assert.equal(canSnoozeDose(dose()), true);
});

test('دوا مواعيده حرجة: الغفوة ممنوعة مهما كان', () => {
  assert.equal(canSnoozeDose(dose({ is_critical: 1 })), false);
  // حتى لو snooze_allowed متسابة 1 في قاعدة البيانات بالغلط
  assert.equal(canSnoozeDose(dose({ is_critical: 1, snooze_allowed: 1 })), false);
});

test('المتابع قافل الغفوة للدوا ده: ممنوعة', () => {
  assert.equal(canSnoozeDose(dose({ snooze_allowed: 0 })), false);
});

/* من غير السقف ده، "فكّرني بعدين" بتتحول لطريقة مريحة لتفويت الجرعة بالكامل -
   وده عكس الغرض من التطبيق. */
test('سقف الغفوات: بعد الحد الأقصى مفيش تأجيل تاني', () => {
  assert.equal(canSnoozeDose(dose({ snooze_count: MAX_SNOOZES - 1 })), true);
  assert.equal(canSnoozeDose(dose({ snooze_count: MAX_SNOOZES })), false);
  assert.equal(canSnoozeDose(dose({ snooze_count: MAX_SNOOZES + 5 })), false);
});

test('جرعة اتسجّلت أو فاتت: مفيش غفوة', () => {
  assert.equal(canSnoozeDose(dose({ status: 'taken' })), false);
  assert.equal(canSnoozeDose(dose({ status: 'missed' })), false);
});

/* ---------- توكن الأفعال ----------
   دي الحاجة اللي بتخلي زرار "خدته" يشتغل من جوّه الإشعار. لو التحقق بقى
   متساهل، أي حد يقدر يسجّل جرعات لأي مريض. */

test('توكن الجرعة: بيتوقّع ويترجع صح', () => {
  const token = signDoseAction(7, 42);
  assert.deepEqual(verifyDoseAction(token), { uid: 7, doseId: 42 });
});

test('توكن مزوّر أو فاضي: بيترفض من غير ما يرمي استثناء', () => {
  assert.equal(verifyDoseAction('not-a-token'), null);
  assert.equal(verifyDoseAction(''), null);
  assert.equal(verifyDoseAction(undefined), null);
});

/* نفس المفتاح بيوقّع كل التوكنات، فالنوع (kind) هو الحاجة الوحيدة اللي
   بتمنع توكن إثبات التوصيل إنه يتستخدم كتوكن تسجيل جرعة والعكس. */
test('توكن من نوع تاني ما ينفعش يتستخدم مكان النوع الصح', () => {
  const ackToken = signAck(99);
  assert.equal(verifyDoseAction(ackToken), null);

  const doseToken = signDoseAction(7, 42);
  assert.equal(verifyAck(doseToken), null);
});

test('توكن إثبات التوصيل بيرجع رقم الإشعار', () => {
  assert.deepEqual(verifyAck(signAck(99)), { notificationId: 99 });
});
