/* اختبار تكامل حقيقي: بيشغّل السيرفر الفعلي على بورت عشوائي وبيضرب endpoints حقيقية
   بـ HTTP فوق قاعدة بيانات حقيقية - مش mock. ده بيمسك نوع الباجات اللي اختبارات
   الـ unit (access.test.js, doses...) مبنيًا على mocks مبتقدرش تمسكه أصلاً:
   route اتسجل غلط، عمود SQL اتكتب غلط، middleware اتنسي، إلخ.

   لو مفيش قاعدة بيانات متاحة (أو JWT_SECRET مش مظبوط) التيست بيتخطى نفسه
   بدل ما يفشل - عشان يفضل شغال في أي بيئة من غير ما يعطّل باقي التيستات.
*/
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

let dbAvailable = false;
let server;
let baseUrl;
const cleanupUserIds = [];

before(async () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    console.log('  [integration] JWT_SECRET مش مظبوط - تخطينا اختبار التكامل');
    return;
  }
  const pool = require('../db');
  try {
    await pool.query('SELECT 1');
  } catch (e) {
    console.log('  [integration] قاعدة البيانات مش متاحة - تخطينا اختبار التكامل:', e.message);
    return;
  }

  const app = require('../server'); // ما بيعملش listen ولا يشغّل الـ scheduler (require.main !== module هنا)
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
  dbAvailable = true;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  const pool = require('../db');
  if (cleanupUserIds.length) {
    // حذف المستخدمين بيمسح معاه (CASCADE) أي مريض/دواء/جرعة/ربط اتعمل أثناء التيست
    await pool.query(`DELETE FROM users WHERE id IN (${cleanupUserIds.map(() => '?').join(',')})`, cleanupUserIds);
  }
  // من غير القفل ده، الـ connection pool بيفضل فاتح ماسك الـ event loop، والعملية
  // بتوقف تعلّق لحد ما node --test يجبرها تنتهي بـ timeout - حتى لو كل التيستات نجحت.
  if (dbAvailable) await pool.end();
});

async function api(baseUrlLocal, path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(baseUrlLocal + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

test('تدفق كامل حقيقي: تسجيل متابع → إضافة مريض → دواء → أخد جرعة', async (t) => {
  if (!dbAvailable) {
    t.skip('قاعدة البيانات/الإعدادات مش متاحة في البيئة دي');
    return;
  }

  const phone = '0100' + Date.now().toString().slice(-7); // رقم فريد كل تشغيلة

  // 1) تسجيل متابع جديد
  const registered = await api(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: { name: 'تيست متابع', phone, password: 'test1234' },
  });
  assert.equal(registered.status, 201);
  const caregiverToken = registered.body.token;
  cleanupUserIds.push(registered.body.user.id);

  // 2) تسجيل الدخول بنفس البيانات لازم يشتغل برضه
  const loggedIn = await api(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { identifier: phone, password: 'test1234' },
  });
  assert.equal(loggedIn.status, 200);

  // 3) إضافة مريض
  const patientRes = await api(baseUrl, '/api/patients', {
    method: 'POST',
    token: caregiverToken,
    body: { name: 'تيست مريض' },
  });
  assert.equal(patientRes.status, 201);
  const patientId = patientRes.body.patient.id;
  cleanupUserIds.push(patientId);

  // 4) إضافة دواء بميعاد دلوقتي بالظبط
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const medRes = await api(baseUrl, '/api/medications', {
    method: 'POST',
    token: caregiverToken,
    body: { patientId, name: 'تيست دواء', times: [hhmm], startDate: today },
  });
  assert.equal(medRes.status, 201);

  // 5) جرعات النهارده لازم يبقى فيها جرعة واحدة pending
  const doses1 = await api(baseUrl, `/api/medications/${patientId}/today`, { token: caregiverToken });
  assert.equal(doses1.status, 200);
  assert.equal(doses1.body.doses.length, 1);
  assert.equal(doses1.body.doses[0].status, 'pending');
  const doseId = doses1.body.doses[0].id;

  // 6) تسجيل إن الجرعة اتاخدت
  const take = await api(baseUrl, `/api/doses/${doseId}/take`, { method: 'POST', token: caregiverToken });
  assert.equal(take.status, 200);
  assert.equal(take.body.ok, true);

  // 7) لازم تبقى "taken" فعليًا في القاعدة
  const doses2 = await api(baseUrl, `/api/medications/${patientId}/today`, { token: caregiverToken });
  assert.equal(doses2.body.doses[0].status, 'taken');

  // 8) محاولة تسجيلها تاني لازم ترفض (409) - مش تتسجل مرتين
  const takeAgain = await api(baseUrl, `/api/doses/${doseId}/take`, { method: 'POST', token: caregiverToken });
  assert.equal(takeAgain.status, 409);
});

test('route محمي من غير توكن - 401 فعليًا على الشبكة مش بس في الميدل وير المعزول', async (t) => {
  if (!dbAvailable) {
    t.skip('قاعدة البيانات/الإعدادات مش متاحة في البيئة دي');
    return;
  }
  const res = await api(baseUrl, '/api/patients');
  assert.equal(res.status, 401);
});

test('تسجيل برقم موبايل موجود قبل كده - 409', async (t) => {
  if (!dbAvailable) {
    t.skip('قاعدة البيانات/الإعدادات مش متاحة في البيئة دي');
    return;
  }
  const phone = '0101' + Date.now().toString().slice(-7);
  const first = await api(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: { name: 'تيست ١', phone, password: 'test1234' },
  });
  cleanupUserIds.push(first.body.user.id);

  const second = await api(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: { name: 'تيست ٢', phone, password: 'test5678' },
  });
  assert.equal(second.status, 409);
});
