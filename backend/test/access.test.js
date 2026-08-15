/* اختبار canAccessPatient - أهم دالة صلاحيات في المشروع كله: هي اللي بتقرر
   لو متابع/مريض يقدر يشوف أو يعدّل بيانات مريض معيّن. غلطة فيها = تسريب بيانات
   مريض لمتابع مش بتاعه. بنعمل mock لـ pool.query عشان التيست يبقى سريع
   وما يحتاجش قاعدة بيانات حقيقية شغالة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../db');
const { canAccessPatient } = require('../utils/access');

test('المريض يقدر يشوف بياناته هو بس', async () => {
  const user = { id: 5, role: 'patient' };
  assert.equal(await canAccessPatient(user, 5), true);
  assert.equal(await canAccessPatient(user, 6), false); // من غير أي query - قصور مبكر
});

test('patientId غير رقم (NaN) بيترفض على طول', async () => {
  const user = { id: 5, role: 'patient' };
  assert.equal(await canAccessPatient(user, 'not-a-number'), false);
  assert.equal(await canAccessPatient(user, undefined), false);
});

test('متابع له ربط في patient_caregiver - مسموح', async (t) => {
  t.mock.method(pool, 'query', async () => [[{ id: 1 }]]); // صف واحد = فيه ربط
  const user = { id: 10, role: 'caregiver' };
  assert.equal(await canAccessPatient(user, 42), true);
});

test('متابع من غير ربط في patient_caregiver - ممنوع', async (t) => {
  t.mock.method(pool, 'query', async () => [[]]); // صفوف فاضية = مفيش ربط
  const user = { id: 10, role: 'caregiver' };
  assert.equal(await canAccessPatient(user, 42), false);
});

test('متابع بيستعلم بـ patientId و caregiver_id الصح', async (t) => {
  const calls = [];
  t.mock.method(pool, 'query', async (sql, params) => {
    calls.push(params);
    return [[]];
  });
  const user = { id: 99, role: 'caregiver' };
  await canAccessPatient(user, '42'); // سترينج - لازم يتحول لرقم قبل الاستعلام
  assert.deepEqual(calls[0], [42, 99]);
});
