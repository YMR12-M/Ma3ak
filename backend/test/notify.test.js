/* اختبار قواعد "مين بياخد تنبيه ومين لأ".

   ليه ده أهم تيست في الميزة كلها: القواعد دي هي الفرق بين تطبيق بيرن على
   المستخدم في وقت غلط لحد ما يقفله، وتطبيق بيسكت في الوقت اللي التنبيه فيه
   بيبقى فارق بين حياة وموت. غلطة في السطور دي مبتظهرش في أي شاشة - بتظهر
   يوم ما جرعة أنسولين تفوت والتنبيه يكون اتأجّل لبكرة الصبح. */
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-'.padEnd(40, 'x');

const pushService = require('../utils/push');
const { isWithinQuietHours, shouldPush, DEFAULT_PREFS } = require('../utils/notify');

const prefs = (over = {}) => ({ ...DEFAULT_PREFS, ...over });

/* ---------- ساعات الهدوء ---------- */

test('ساعات الهدوء العادية (جوه نفس اليوم)', () => {
  const p = prefs({ quiet_start: '13:00', quiet_end: '15:00' });
  assert.equal(isWithinQuietHours(p, '14:00'), true);
  assert.equal(isWithinQuietHours(p, '12:59'), false);
  assert.equal(isWithinQuietHours(p, '15:00'), false); // النهاية مش داخلة
});

/* دي الحالة اللي المقارنة النصية البسيطة بتفشل فيها، وهي كمان الحالة
   الطبيعية: محدش بيحط ساعات هدوء من 1 لـ 3 الضهر - الكل بيحطها بالليل. */
test('ساعات الهدوء اللي بتعدّي منتصف الليل (22:00 → 07:00)', () => {
  const p = prefs({ quiet_start: '22:00', quiet_end: '07:00' });
  assert.equal(isWithinQuietHours(p, '23:30'), true); // قبل منتصف الليل
  assert.equal(isWithinQuietHours(p, '03:00'), true); // بعد منتصف الليل
  assert.equal(isWithinQuietHours(p, '07:00'), false); // خلصت
  assert.equal(isWithinQuietHours(p, '12:00'), false); // نص النهار
});

test('من غير ساعات هدوء محددة، مفيش أي وقت بيتحسب هدوء', () => {
  assert.equal(isWithinQuietHours(prefs(), '03:00'), false);
  assert.equal(isWithinQuietHours(prefs({ quiet_start: '22:00' }), '23:00'), false); // ناقصة نهاية
  // بداية = نهاية معناها فترة صفر، مش يوم كامل
  assert.equal(isWithinQuietHours(prefs({ quiet_start: '22:00', quiet_end: '22:00' }), '22:30'), false);
});

/* ---------- قرار الدفع ---------- */

// الدفع معطّل من غير مفاتيح VAPID، فبنخلّيه "شغّال" عشان نختبر القواعد نفسها
function withPushEnabled(t) {
  t.mock.method(pushService, 'isPushEnabled', () => true);
}

test('الوضع الطبيعي: التنبيه بيتبعت', (t) => {
  withPushEnabled(t);
  assert.equal(shouldPush(prefs(), 'missed_dose', 'normal').push, true);
});

test('المفتاح الرئيسي مقفول: مفيش دفع خالص، حتى للحرج', (t) => {
  withPushEnabled(t);
  const p = prefs({ push_enabled: 0 });
  assert.equal(shouldPush(p, 'missed_dose', 'normal').push, false);
  // ده مقصود: المستخدم قال "مش عايز إشعارات على الجهاز ده خالص" - ده قراره
  assert.equal(shouldPush(p, 'dose_escalation', 'critical').push, false);
});

test('تفضيل النوع مقفول: العادي بيتمنع، والحرج بيعدّي', (t) => {
  withPushEnabled(t);
  const p = prefs({ pref_missed_dose: 0 });
  assert.equal(shouldPush(p, 'missed_dose', 'normal').push, false);
  assert.equal(shouldPush(p, 'missed_dose', 'normal').reason, 'type-off:missed_dose');
  // نفس النوع بالظبط، بس حرج - لازم يعدّي
  assert.equal(shouldPush(p, 'missed_dose', 'critical').push, true);
});

/* أهم تأكيد في الملف: التنبيه الحرج ما ينفعش يستنى الصبح. لو السطر ده فشل
   يوم من الأيام، يبقى التطبيق رجع "مفكّرة" وبطّل يكون شبكة أمان. */
test('ساعات الهدوء: العادي بيستنى، والحرج بيعدّي في أي وقت', (t) => {
  withPushEnabled(t);
  const p = prefs({ quiet_start: '00:00', quiet_end: '23:59' }); // اليوم كله هدوء
  assert.equal(shouldPush(p, 'upcoming_appointment', 'info').push, false);
  assert.equal(shouldPush(p, 'upcoming_appointment', 'info').reason, 'quiet-hours');
  assert.equal(shouldPush(p, 'dose_escalation', 'critical').push, true);
  assert.equal(shouldPush(p, 'patient_issue', 'critical').push, true);
});

test('النوع اللي مالوش تفضيل (general) بيعدّي دايمًا', (t) => {
  withPushEnabled(t);
  assert.equal(shouldPush(prefs(), 'general', 'normal').push, true);
});

/* لو السيرفر نفسه من غير مفاتيح VAPID (نسيان في .env على الإنتاج مثلاً)،
   مفيش دفع خالص - والسبب لازم يبان في اللوج بوضوح. من غير السطر ده حد ممكن
   يفضل شهر مفكّر إن التنبيهات شغالة وهي مش متفعّلة أصلاً على السيرفر.

   بنعمل mock للحالة دي بدل ما نعتمد على .env: التيست لازم يطلّع نفس النتيجة
   على جهاز المطوّر (فيه مفاتيح) وعلى CI (مفيهوش). */
test('السيرفر من غير مفاتيح VAPID: مفيش دفع والسبب واضح في اللوج', (t) => {
  t.mock.method(pushService, 'isPushEnabled', () => false);
  const result = shouldPush(prefs(), 'missed_dose', 'critical');
  assert.equal(result.push, false);
  assert.equal(result.reason, 'push-disabled-server');
});
