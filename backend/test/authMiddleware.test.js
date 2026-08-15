/* اختبار authRequired - البوابة اللي كل route محمي في المشروع بيعدي منها.
   لو فيها ثغرة، كل الـ API مكشوف. بنحط JWT_SECRET تجريبي قبل ما نستدعي الملف
   عشان التيست يبقى مستقل عن وجود .env من عدمه. */
process.env.JWT_SECRET = 'test-only-secret-not-used-in-production-1234';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { authRequired } = require('../middleware/auth');

function makeRes() {
  const res = {};
  res.statusCode = null;
  res.body = null;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

test('من غير هيدر Authorization خالص - 401', () => {
  const req = { headers: {} };
  const res = makeRes();
  let nextCalled = false;
  authRequired(req, res, () => (nextCalled = true));
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test('توكن فاسد/متلاعب فيه - 401', () => {
  const req = { headers: { authorization: 'Bearer this-is-not-a-real-jwt' } };
  const res = makeRes();
  let nextCalled = false;
  authRequired(req, res, () => (nextCalled = true));
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test('توكن اتوقّع بمفتاح مختلف عن JWT_SECRET الحالي - 401 (أهم حالة أمان هنا)', () => {
  const wrongSecretToken = jwt.sign({ id: 1, role: 'caregiver' }, 'a-completely-different-secret');
  const req = { headers: { authorization: `Bearer ${wrongSecretToken}` } };
  const res = makeRes();
  let nextCalled = false;
  authRequired(req, res, () => (nextCalled = true));
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test('توكن صحيح - بيعدي وبيحط req.user من الـ payload', () => {
  const token = jwt.sign({ id: 7, role: 'patient', name: 'جدو محمود' }, process.env.JWT_SECRET);
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = makeRes();
  let nextCalled = false;
  authRequired(req, res, () => (nextCalled = true));
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null); // متلمسش res خالص لو التوكن سليم
  assert.equal(req.user.id, 7);
  assert.equal(req.user.role, 'patient');
});

test('توكن منتهي الصلاحية - 401', () => {
  const expiredToken = jwt.sign({ id: 1, role: 'caregiver' }, process.env.JWT_SECRET, {
    expiresIn: -10, // اتعمل من 10 ثواني "في المستقبل السالب" - يعني منتهي فورًا
  });
  const req = { headers: { authorization: `Bearer ${expiredToken}` } };
  const res = makeRes();
  let nextCalled = false;
  authRequired(req, res, () => (nextCalled = true));
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});
