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

  /* 4) إضافة دواء بميعاد دلوقتي بالظبط - بتوقيت مصر تحديدًا، مش بتوقيت الجهاز
     اللي بيشغّل التيست. السيرفر بيولّد الجرعات ويحسب "لسه بدري" بتوقيت مصر،
     فلو بعتنا ساعة الجهاز، على جهاز بتوقيت تاني (زي CI اللي شغال UTC) الجرعة
     بتتولد في ساعة تانية خالص وتيجي "لسه بدري" فيترفض تأكيدها بـ403. */
  const hhmm = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
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

/* ============================================
   اختبارات منع تكرار (regression): كل طلب من دول كان بيوقّع السيرفر بالكامل -
   مش بيرجع 500، لأ بيقتل العملية نفسها. السبب إن الـ routes دوال async من غير
   try/catch، وExpress 4 مش بيمسك الـ Promise المرفوض، فNode كان بينهي البرنامج.
   يعني أي مستخدم مسجّل (حتى المريض) كان يقدر يقفل التطبيق على كل الناس بطلب واحد.

   الاختبارات دي بتتأكد من حاجتين مع بعض: إن الرد بقى 400 مفهوم، وإن السيرفر
   لسه شغال بعده فعليًا (الطلب اللي بعده بينجح).
   ============================================ */
test('مدخلات بايظة بترجع 400 والسيرفر يفضل شغال (كانت بتوقّعه بالكامل)', async (t) => {
  if (!dbAvailable) {
    t.skip('قاعدة البيانات/الإعدادات مش متاحة في البيئة دي');
    return;
  }

  const phone = '0102' + Date.now().toString().slice(-7);
  const reg = await api(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: { name: 'تيست كراش', phone, password: 'test1234' },
  });
  const token = reg.body.token;
  cleanupUserIds.push(reg.body.user.id);

  const patientRes = await api(baseUrl, '/api/patients', {
    method: 'POST',
    token,
    body: { name: 'مريض كراش' },
  });
  const patientId = patientRes.body.patient.id;
  cleanupUserIds.push(patientId);

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
  const medRes = await api(baseUrl, '/api/medications', {
    method: 'POST',
    token,
    body: { patientId, name: 'دوا كراش', times: ['08:00'], startDate: today },
  });
  const medId = medRes.body.id;

  const badRequests = [
    ['اسم دواء أطول من عمود قاعدة البيانات', 'POST', '/api/medications',
      { patientId, name: 'ا'.repeat(300), times: ['08:00'], startDate: today }],
    ['تاريخ بداية بايظ', 'POST', '/api/medications',
      { patientId, name: 'x', times: ['08:00'], startDate: 'مش تاريخ' }],
    ['ميعاد جرعة مستحيل', 'POST', '/api/medications',
      { patientId, name: 'x', times: ['25:99'], startDate: today }],
    ['مواعيد مش نصوص', 'POST', '/api/medications',
      { patientId, name: 'x', times: [{ a: 1 }], startDate: today }],
    ['تاريخ موعد بايظ', 'POST', '/api/appointments',
      { patientId, title: 'x', appointmentAt: 'مش تاريخ' }],
    ['وقت قياس بايظ', 'POST', '/api/vitals',
      { patientId, type: 'weight', value: { value: 70 }, recordedAt: 'مش تاريخ' }],
    ['اسم مريض أطول من عمود قاعدة البيانات', 'POST', '/api/patients',
      { name: 'ا'.repeat(300) }],
  ];

  for (const [label, method, path, body] of badRequests) {
    const res = await api(baseUrl, path, { method, token, body });
    assert.equal(res.status, 400, `${label}: المفروض 400 بس رجع ${res.status}`);
    assert.ok(res.body && res.body.error, `${label}: المفروض يرجع رسالة خطأ مفهومة`);
  }

  // نطاق تواريخ بايظ في الاستعلام كان بيوقّع السيرفر برضه
  const badRange = await api(baseUrl, `/api/doses?patientId=${patientId}&from=${encodeURIComponent('مش-تاريخ')}`, { token });
  assert.equal(badRange.status, 400);

  // أهم تأكيد: السيرفر لسه عايش وبيرد عادي بعد كل ده
  const stillAlive = await api(baseUrl, `/api/medications?patientId=${patientId}`, { token });
  assert.equal(stillAlive.status, 200, 'السيرفر وقع بعد المدخلات البايظة');
});

test('تعديل دواء من غير ما تبعت times ما بيكسرش عمود الـ JSON', async (t) => {
  if (!dbAvailable) {
    t.skip('قاعدة البيانات/الإعدادات مش متاحة في البيئة دي');
    return;
  }

  /* الحالة دي كانت بتوقّع السيرفر: mysql2 بيرجع أعمدة JSON كـ array جاهز،
     ولما الكود كان بيرجّعه للاستعلام زي ما هو، mysql2 بيفرده لـ '08:00' -
     نص مش JSON صالح فقاعدة البيانات بترفضه. */
  const phone = '0103' + Date.now().toString().slice(-7);
  const reg = await api(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: { name: 'تيست تعديل', phone, password: 'test1234' },
  });
  const token = reg.body.token;
  cleanupUserIds.push(reg.body.user.id);

  const patientRes = await api(baseUrl, '/api/patients', { method: 'POST', token, body: { name: 'مريض تعديل' } });
  const patientId = patientRes.body.patient.id;
  cleanupUserIds.push(patientId);

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
  const medRes = await api(baseUrl, '/api/medications', {
    method: 'POST',
    token,
    body: { patientId, name: 'دوا', times: ['08:00', '20:00'], startDate: today },
  });
  const medId = medRes.body.id;

  // تعديل الاسم بس، من غير ما نبعت times خالص
  const put = await api(baseUrl, `/api/medications/${medId}`, {
    method: 'PUT',
    token,
    body: { name: 'اسم جديد' },
  });
  assert.equal(put.status, 200);

  // المواعيد لازم تفضل زي ما هي بالظبط بعد التعديل
  const after = await api(baseUrl, `/api/medications?patientId=${patientId}`, { token });
  const med = after.body.medications.find((m) => m.id === medId);
  const times = typeof med.times === 'string' ? JSON.parse(med.times) : med.times;
  assert.deepEqual(times, ['08:00', '20:00']);
  assert.equal(med.name, 'اسم جديد');
});

/* ---------------------------------------------------------------------------
   المنبه: الغفوة، والتسجيل من جوّه الإشعار

   المسارات دي بالذات محتاجة اختبار تكامل حقيقي مش unit: الفعل بيمر على
   توكن موقّع، وroute من غير تسجيل دخول، وأعمدة اتضافت جديدة على الجدول.
   أي واحدة فيهم لو اتظبطت غلط، التيست المعزول مش هيلاحظ - والمريض هو اللي
   هيلاحظ يوم ما يدوس "خدته" في الإشعار وميحصلش حاجة.
   --------------------------------------------------------------------------- */

// بيجهّز متابع + مريض + دوا بميعاد دلوقتي، ويرجّع أول جرعة مستنية.
// نفس أسلوب حساب الوقت في التيست الأول: بتوقيت مصر مش بتوقيت الجهاز.
async function setupDueDose(prefix, medBody = {}) {
  const phone = prefix + Date.now().toString().slice(-7);
  const reg = await api(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: { name: 'تيست منبه', phone, password: 'test1234' },
  });
  const token = reg.body.token;
  cleanupUserIds.push(reg.body.user.id);

  const patientRes = await api(baseUrl, '/api/patients', {
    method: 'POST',
    token,
    body: { name: 'مريض منبه' },
  });
  const patientId = patientRes.body.patient.id;
  cleanupUserIds.push(patientId);

  const hhmm = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());

  await api(baseUrl, '/api/medications', {
    method: 'POST',
    token,
    body: { patientId, name: 'دوا المنبه', times: [hhmm], startDate: today, ...medBody },
  });

  const doses = await api(baseUrl, `/api/medications/${patientId}/today`, { token });
  return { token, patientId, dose: doses.body.doses[0] };
}

test('الغفوة: بتأجّل الجرعة وبتتوقف عند السقف', async (t) => {
  if (!dbAvailable) {
    t.skip('قاعدة البيانات/الإعدادات مش متاحة في البيئة دي');
    return;
  }
  const { token, patientId, dose } = await setupDueDose('0104');
  assert.equal(dose.status, 'pending');

  const { MAX_SNOOZES } = require('../../frontend/js/doseLogic');

  for (let i = 1; i <= MAX_SNOOZES; i += 1) {
    const res = await api(baseUrl, `/api/doses/${dose.id}/snooze`, { method: 'POST', token });
    assert.equal(res.status, 200, `الغفوة رقم ${i} المفروض تنجح`);
    assert.equal(res.body.snooze_count, i);
    assert.equal(res.body.snoozes_left, MAX_SNOOZES - i);
  }

  // بعد السقف: مرفوضة. من غير الحد ده "فكّرني بعدين" بتبقى طريقة لتفويت
  // الجرعة بالكامل، وده عكس الغرض من التطبيق
  const overLimit = await api(baseUrl, `/api/doses/${dose.id}/snooze`, { method: 'POST', token });
  assert.equal(overLimit.status, 429);

  // الجرعة لسه "مستنية" مش "فايتة" - الغفوة بتأجّل مش بتلغي
  const after = await api(baseUrl, `/api/medications/${patientId}/today`, { token });
  assert.equal(after.body.doses[0].status, 'pending');
  assert.equal(after.body.doses[0].snooze_count, MAX_SNOOZES);
  assert.ok(after.body.doses[0].snooze_until, 'المفروض يكون فيه ميعاد غفوة محفوظ');
});

test('الدوا الحرج: الغفوة مرفوضة من السيرفر مش بس مخفية في الواجهة', async (t) => {
  if (!dbAvailable) {
    t.skip('قاعدة البيانات/الإعدادات مش متاحة في البيئة دي');
    return;
  }
  const { token, dose } = await setupDueDose('0105', { isCritical: true });
  const res = await api(baseUrl, `/api/doses/${dose.id}/snooze`, { method: 'POST', token });
  assert.equal(res.status, 403);
});

test('تسجيل الجرعة بتوكن الإشعار - من غير تسجيل دخول خالص', async (t) => {
  if (!dbAvailable) {
    t.skip('قاعدة البيانات/الإعدادات مش متاحة في البيئة دي');
    return;
  }
  const { token, patientId, dose } = await setupDueDose('0106');
  const { signDoseAction } = require('../utils/actionToken');

  // التوكن ده هو اللي بيتبعت جوه حمولة الإشعار للـ Service Worker
  const actionToken = signDoseAction(patientId, dose.id);

  // ملاحظ: من غير token في الهيدر - ده بالظبط وضع الـ Service Worker
  const res = await api(baseUrl, '/api/doses/action', {
    method: 'POST',
    body: { token: actionToken, action: 'take' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);

  const after = await api(baseUrl, `/api/medications/${patientId}/today`, { token });
  assert.equal(after.body.doses[0].status, 'taken');
});

test('توكن إشعار مزوّر أو لمريض تاني: مرفوض', async (t) => {
  if (!dbAvailable) {
    t.skip('قاعدة البيانات/الإعدادات مش متاحة في البيئة دي');
    return;
  }
  const { patientId, dose } = await setupDueDose('0107');
  const { signDoseAction } = require('../utils/actionToken');

  const garbage = await api(baseUrl, '/api/doses/action', {
    method: 'POST',
    body: { token: 'aaa.bbb.ccc', action: 'take' },
  });
  assert.equal(garbage.status, 401);

  /* توكن موقّع صح بس بيدّعي إن الجرعة لمستخدم تاني. لو التحقق ده اتشال،
     أي حد عارف id جرعة يقدر يسجّلها لمريض مش بتاعه. */
  const wrongUser = await api(baseUrl, '/api/doses/action', {
    method: 'POST',
    body: { token: signDoseAction(patientId + 99999, dose.id), action: 'take' },
  });
  assert.equal(wrongUser.status, 403);
});

test('تفضيلات الإشعارات: بتتحفظ على الحساب، وساعات الهدوء الناقصة مرفوضة', async (t) => {
  if (!dbAvailable) {
    t.skip('قاعدة البيانات/الإعدادات مش متاحة في البيئة دي');
    return;
  }
  const phone = '0108' + Date.now().toString().slice(-7);
  const reg = await api(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: { name: 'تيست تفضيلات', phone, password: 'test1234' },
  });
  const token = reg.body.token;
  cleanupUserIds.push(reg.body.user.id);

  // مستخدم جديد: الافتراضي كله شغال - التطبيق يفكّره من غير ما يظبط حاجة
  const initial = await api(baseUrl, '/api/notifications/prefs', { token });
  assert.equal(initial.status, 200);
  assert.equal(initial.body.prefs.push_enabled, 1);
  assert.equal(initial.body.prefs.quiet_start, null);

  const saved = await api(baseUrl, '/api/notifications/prefs', {
    method: 'PUT',
    token,
    body: { quiet_start: '22:00', quiet_end: '07:00', pref_appointment: false },
  });
  assert.equal(saved.status, 200);

  const reloaded = await api(baseUrl, '/api/notifications/prefs', { token });
  assert.equal(reloaded.body.prefs.quiet_start, '22:00'); // "HH:MM" مش "HH:MM:SS"
  assert.equal(reloaded.body.prefs.quiet_end, '07:00');
  assert.equal(reloaded.body.prefs.pref_appointment, 0);
  assert.equal(reloaded.body.prefs.pref_dose_due, 1); // اللي مبعتوش ما اتغيّرش

  /* بداية من غير نهاية = فترة هدوء مفتوحة للأبد = إشعارات مقفولة بالكامل من
     غير ما المستخدم يقصد. ده بالظبط نوع الغلطة اللي بتخلي تذكير دوا ميوصلش. */
  const halfRange = await api(baseUrl, '/api/notifications/prefs', {
    method: 'PUT',
    token,
    body: { quiet_start: '22:00', quiet_end: null },
  });
  assert.equal(halfRange.status, 400);

  const badTime = await api(baseUrl, '/api/notifications/prefs', {
    method: 'PUT',
    token,
    body: { quiet_start: '99:99', quiet_end: '07:00' },
  });
  assert.equal(badTime.status, 400);
});

/* ---------------------------------------------------------------------------
   الفجوات اللي كشفها فحص المشروع

   كل تيست هنا بيغطي عيب كان موجود فعلاً، مش ميزة نظرية - فلو واحد فيهم فشل
   يومًا ما، يبقى العيب رجع.
   --------------------------------------------------------------------------- */

async function registerCaregiver(prefix, name = 'تيست') {
  const phone = prefix + Date.now().toString().slice(-7) + Math.floor(Math.random() * 90 + 10);
  const reg = await api(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: { name, phone, password: 'test1234' },
  });
  if (reg.body && reg.body.user) cleanupUserIds.push(reg.body.user.id);
  return { ...reg.body, phone, status: reg.status };
}

test('جلسة المريض سنة كاملة مش أسبوع', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const jwt = require('jsonwebtoken');

  const caregiver = await registerCaregiver('0110');
  const patientRes = await api(baseUrl, '/api/patients', {
    method: 'POST',
    token: caregiver.token,
    body: { name: 'مريض جلسة' },
  });
  cleanupUserIds.push(patientRes.body.patient.id);

  const access = await api(baseUrl, '/api/auth/access', {
    method: 'POST',
    body: { token: patientRes.body.patient.access_token },
  });
  assert.equal(access.status, 200);

  /* السبب مش أمان أقل - اللينك نفسه هو المفتاح وهو موجود على الجهاز طول
     الوقت. السبب إن المريض مالوش باسورد: لما التوكن كان بينتهي بعد 7 أيام،
     كان بيلاقي شاشة تسجيل دخول مالهاش أي معنى بالنسبة له، ومفيش قدامه غير
     إنه يكلّم ابنه. */
  const patientToken = jwt.decode(access.body.token);
  const caregiverToken = jwt.decode(caregiver.token);
  const patientDays = (patientToken.exp - patientToken.iat) / 86400;
  const caregiverDays = (caregiverToken.exp - caregiverToken.iat) / 86400;

  assert.equal(patientDays, 365);
  assert.equal(caregiverDays, 7);
});

test('ملاحظات الدوا بتوصل المريض في جرعات النهاردة', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const caregiver = await registerCaregiver('0111');
  const patientRes = await api(baseUrl, '/api/patients', {
    method: 'POST',
    token: caregiver.token,
    body: { name: 'مريض ملاحظات' },
  });
  const patientId = patientRes.body.patient.id;
  cleanupUserIds.push(patientId);

  const hhmm = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());

  await api(baseUrl, '/api/medications', {
    method: 'POST',
    token: caregiver.token,
    body: {
      patientId,
      name: 'دوا بملاحظات',
      times: [hhmm],
      startDate: today,
      notes: 'خده بعد الأكل بساعة',
    },
  });

  /* العمود ده كان **ناقص** من الاستعلام: المتابع بيكتب تعليمات الدكتور
     وبتتخزن وبتبان في شاشته، والمريض عمره ما شافها. */
  const doses = await api(baseUrl, `/api/medications/${patientId}/today`, { token: caregiver.token });
  assert.equal(doses.body.doses[0].notes, 'خده بعد الأكل بساعة');
});

test('صورة الدوا: رفع، قراية، وحذف', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const caregiver = await registerCaregiver('0112');
  const patientRes = await api(baseUrl, '/api/patients', {
    method: 'POST',
    token: caregiver.token,
    body: { name: 'مريض صورة' },
  });
  const patientId = patientRes.body.patient.id;
  cleanupUserIds.push(patientId);

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
  const medRes = await api(baseUrl, '/api/medications', {
    method: 'POST',
    token: caregiver.token,
    body: { patientId, name: 'دوا بصورة', times: ['08:00'], startDate: today },
  });
  const medId = medRes.body.id;

  // أصغر PNG صالح (1×1 شفافة)
  const tinyPng =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  const put = await api(baseUrl, `/api/medications/${medId}/image`, {
    method: 'PUT',
    token: caregiver.token,
    body: { mime: 'image/png', data: tinyPng },
  });
  assert.equal(put.status, 200);

  const get = await api(baseUrl, `/api/medications/${medId}/image`, { token: caregiver.token });
  assert.equal(get.status, 200);
  assert.match(get.body.dataUrl, /^data:image\/png;base64,/);

  // has_image بيخلي القايمة تعرف "فيه صورة" من غير ما تشحنها مع كل طلب
  const meds = await api(baseUrl, `/api/medications?patientId=${patientId}`, { token: caregiver.token });
  assert.equal(meds.body.medications.find((m) => m.id === medId).has_image, 1);

  /* صورة أكبر من الحد العام لأجسام الطلبات (100 كيلو).

     المحلّل العام في server.js بيتخطّى المسار ده عن قصد، وله محلّل خاص بحد
     أوسع. من غير الاستثناء ده كانت أي صورة حقيقية بتترفض قبل ما توصل للـ route
     أصلاً، والمستخدم بيشوف "البيانات المبعوتة مش بصيغة صحيحة" - رسالة بتوّدي
     في اتجاه غلط تمامًا. */
  const bigImage = tinyPng + 'A'.repeat(180 * 1024);
  const bigUpload = await api(baseUrl, `/api/medications/${medId}/image`, {
    method: 'PUT',
    token: caregiver.token,
    body: { mime: 'image/png', data: bigImage.replace(/[^A-Za-z0-9+/]/g, '') },
  });
  assert.equal(bigUpload.status, 200, 'صورة بحجم واقعي لازم تعدي');

  const badMime = await api(baseUrl, `/api/medications/${medId}/image`, {
    method: 'PUT',
    token: caregiver.token,
    body: { mime: 'application/pdf', data: tinyPng },
  });
  assert.equal(badMime.status, 400);

  await api(baseUrl, `/api/medications/${medId}/image`, { method: 'DELETE', token: caregiver.token });
  const gone = await api(baseUrl, `/api/medications/${medId}/image`, { token: caregiver.token });
  assert.equal(gone.status, 404);
});

test('رقم موبايل المتابع بيوصل للمريض عشان زرار الاتصال يشتغل', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const caregiver = await registerCaregiver('0113', 'ابن المريض');
  const patientRes = await api(baseUrl, '/api/patients', {
    method: 'POST',
    token: caregiver.token,
    body: { name: 'مريض اتصال' },
  });
  const patientId = patientRes.body.patient.id;
  cleanupUserIds.push(patientId);

  const access = await api(baseUrl, '/api/auth/access', {
    method: 'POST',
    body: { token: patientRes.body.patient.access_token },
  });

  /* من غير الرقم ده، كارت "متابعك" بيعرض الاسم وخلاص - فكبير السن اللي حاسس
     بتعب قدامه بلاغ يبعته ويستنى، مش زرار يرن بيه على ابنه. */
  const caregivers = await api(baseUrl, `/api/patients/${patientId}/caregivers`, {
    token: access.body.token,
  });
  assert.equal(caregivers.status, 200);
  assert.equal(caregivers.body.caregivers[0].phone, caregiver.phone);
});

test('تغيير كلمة المرور واسترجاعها بكود الاسترجاع', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const caregiver = await registerCaregiver('0114');

  // الكود بيتعرض مرة واحدة بس وقت التسجيل - مبيتخزنش كنص عندنا
  assert.match(caregiver.recoveryCode, /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/);

  const wrongCurrent = await api(baseUrl, '/api/auth/change-password', {
    method: 'POST',
    token: caregiver.token,
    body: { currentPassword: 'wrong-one', newPassword: 'newpass123' },
  });
  assert.equal(wrongCurrent.status, 401);

  const changed = await api(baseUrl, '/api/auth/change-password', {
    method: 'POST',
    token: caregiver.token,
    body: { currentPassword: 'test1234', newPassword: 'newpass123' },
  });
  assert.equal(changed.status, 200);

  const loginNew = await api(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { identifier: caregiver.phone, password: 'newpass123' },
  });
  assert.equal(loginNew.status, 200);

  // ---- الاسترجاع ----
  const badCode = await api(baseUrl, '/api/auth/recover', {
    method: 'POST',
    body: { phone: caregiver.phone, recoveryCode: 'AAAA-BBBB-CCCC-DDDD', newPassword: 'zzz12345' },
  });
  assert.equal(badCode.status, 401);

  const recovered = await api(baseUrl, '/api/auth/recover', {
    method: 'POST',
    body: { phone: caregiver.phone, recoveryCode: caregiver.recoveryCode, newPassword: 'zzz12345' },
  });
  assert.equal(recovered.status, 200);
  assert.ok(recovered.body.token);

  /* الكود بيتستهلك ويتولّد واحد جديد: كود بيفضل صالح للأبد بعد ما اتستخدم
     يبقى باسورد تاني دايم، والمستخدم غالبًا كاتبه في مكان أقل أمانًا. */
  assert.notEqual(recovered.body.recoveryCode, caregiver.recoveryCode);
  const reusedCode = await api(baseUrl, '/api/auth/recover', {
    method: 'POST',
    body: { phone: caregiver.phone, recoveryCode: caregiver.recoveryCode, newPassword: 'qqq12345' },
  });
  assert.equal(reusedCode.status, 401);

  const loginRecovered = await api(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { identifier: caregiver.phone, password: 'zzz12345' },
  });
  assert.equal(loginRecovered.status, 200);
});

test('فك الارتباط والحذف: القواعد بتحمي بيانات المرضى المشتركين', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const first = await registerCaregiver('0115', 'متابع أول');
  const patientRes = await api(baseUrl, '/api/patients', {
    method: 'POST',
    token: first.token,
    body: { name: 'مريض مشترك' },
  });
  const patientId = patientRes.body.patient.id;
  cleanupUserIds.push(patientId);

  /* آخر متابع مينفعش يسيب المريض ويمشي: المريض هيفضل بياخد منبهات ومحدش شايف
     حالته - فشل صامت أسوأ من الحذف نفسه. */
  const leaveAlone = await api(baseUrl, `/api/patients/${patientId}/link`, {
    method: 'DELETE',
    token: first.token,
  });
  assert.equal(leaveAlone.status, 409);

  // متابع تاني بينضم بالكود
  const second = await registerCaregiver('0116', 'متابع تاني');
  await api(baseUrl, '/api/patients/link', {
    method: 'POST',
    token: second.token,
    body: { code: patientRes.body.patient.link_code },
  });

  /* متابع واحد ميقدرش يمسح بيانات مريض بيتابعه ناس تانية - الحذف بيمسح تاريخ
     الأدوية والقياسات لكل المتابعين مرة واحدة من غير رجعة. */
  const deleteShared = await api(baseUrl, `/api/patients/${patientId}`, {
    method: 'DELETE',
    token: first.token,
  });
  assert.equal(deleteShared.status, 409);

  // دلوقتي الخروج مسموح لأن فيه متابع تاني
  const leaveNow = await api(baseUrl, `/api/patients/${patientId}/link`, {
    method: 'DELETE',
    token: first.token,
  });
  assert.equal(leaveNow.status, 200);

  // وبعد ما خرج، مبقاش شايف المريض خالص
  const listAfter = await api(baseUrl, '/api/patients', { token: first.token });
  assert.equal(listAfter.body.patients.some((p) => p.id === patientId), false);

  // والمتابع اللي فضل يقدر يمسح دلوقتي
  const deleteAlone = await api(baseUrl, `/api/patients/${patientId}`, {
    method: 'DELETE',
    token: second.token,
  });
  assert.equal(deleteAlone.status, 200);
});

test('حالة تنبيهات المريض بتبان للمتابع', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const caregiver = await registerCaregiver('0117');
  const patientRes = await api(baseUrl, '/api/patients', {
    method: 'POST',
    token: caregiver.token,
    body: { name: 'مريض تنبيهات' },
  });
  const patientId = patientRes.body.patient.id;
  cleanupUserIds.push(patientId);

  /* المتابع بيجهّز كل حاجة والتنبيه بيروح لجهاز مش في إيده - من غير الشاشة دي
     كان مطمّن إن النظام شغال ويكتشف العكس يوم ما جرعة مهمة تفوت. */
  const status = await api(baseUrl, `/api/patients/${patientId}/notification-status`, {
    token: caregiver.token,
  });
  assert.equal(status.status, 200);
  assert.equal(status.body.deviceCount, 0);
  assert.equal(status.body.ok, false); // مريض جديد لسه مفعّلش حاجة

  const alarm = await api(baseUrl, `/api/patients/${patientId}/test-alarm`, {
    method: 'POST',
    token: caregiver.token,
  });

  /* الرد بيختلف حسب إعداد السيرفر نفسه، والاتنين صح:
       503 → السيرفر من غير مفاتيح VAPID (زي بيئة CI - الـ workflow بيكتب .env
             فيه بيانات قاعدة البيانات و JWT_SECRET بس)
       404 → الدفع مفعّل على السيرفر، بس موبايل المريض لسه مسجّلش أي اشتراك

     التيست بيتأكد من اللي يهم فعلاً في الحالتين: **الرسالة بتقول السبب بالظبط**
     مش "حصل خطأ غير متوقع". الزرار ده موجود عشان المتابع يشخّص المشكلة، ورسالة
     عامة بتخليه يجرب نفس الحاجة تاني بدل ما يعرف يعمل إيه.

     (قبل كده التيست كان بيفترض إن مفاتيح VAPID موجودة - فكان بينجح على جهاز
     المطوّر وبيفشل على CI.) */
  assert.ok([404, 503].includes(alarm.status), `رد غير متوقع: ${alarm.status}`);
  assert.match(alarm.body.error, alarm.status === 503 ? /مش مفعّلة/ : /التنبيهات/);
});

test('تقرير الالتزام: بيحسب النسبة وبيتجاهل اللي لسه ميعاده مجاش', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const caregiver = await registerCaregiver('0118');
  const patientRes = await api(baseUrl, '/api/patients', {
    method: 'POST',
    token: caregiver.token,
    body: { name: 'مريض تقرير' },
  });
  const patientId = patientRes.body.patient.id;
  cleanupUserIds.push(patientId);

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
  const medRes = await api(baseUrl, '/api/medications', {
    method: 'POST',
    token: caregiver.token,
    body: { patientId, name: 'دوا تقرير', times: ['08:00', '20:00'], startDate: today },
  });

  const pool = require('../db');
  // بنكتب جرعات بحالات معروفة مباشرة: التقرير بيقرا التاريخ، ومستنى الجرعات
  // تتاخد فعلاً في تيست معناه انتظار أيام
  const { cairoDateWithOffset } = require('../utils/time');
  for (const [offset, status] of [[-1, 'taken'], [-2, 'taken'], [-3, 'missed'], [-4, 'taken']]) {
    await pool.query(
      `INSERT IGNORE INTO doses (medication_id, patient_id, scheduled_at, status) VALUES (?, ?, ?, ?)`,
      [medRes.body.id, patientId, cairoDateWithOffset(offset, '08:00'), status]
    );
  }

  const report = await api(baseUrl, `/api/patients/${patientId}/adherence?days=30`, {
    token: caregiver.token,
  });
  assert.equal(report.status, 200);
  assert.equal(report.body.taken, 3);
  assert.equal(report.body.missed, 1);
  assert.equal(report.body.rate, 75); // 3 من 4

  /* الجرعة اللي لسه ميعادها مجاش مش "فايتة" ولا "اتاخدت" - لو حسبناها في
     المقام، النسبة بتبان أقل من الحقيقة كل يوم الصبح وبتتحسن لوحدها بالليل. */
  assert.ok(report.body.pendingNotCounted >= 0);
  assert.equal(report.body.byMedication.length, 1);
  assert.equal(report.body.byMedication[0].name, 'دوا تقرير');
});

/* ============================================================
   الفجوات اللي كشفها الفحص الكامل - كل واحد فيهم كان شغّال فعلاً
   ============================================================ */

/* بيعمل متابع في قاعدة البيانات ويوقّع له توكن جلسة مباشرة.

   ليه مش /api/auth/register زي التيستات اللي فوق: مسار التسجيل عليه
   registerLimiter (20 في الساعة لكل IP)، والتيستات كلها بتضرب من نفس الـ IP
   في نفس العملية - فمجموعة تيستات بتسجّل متابع لكل واحدة كانت بتوصل للحد
   وتفشل بـ 429 من غير أي علاقة باللي بتختبره.

   الحد ده حماية حقيقية ومش هنضعّفها عشان التيست. واللي بيتختبر هنا مش
   التسجيل نفسه (ليه تيست خاص بيه فوق) - ده متابع **مسجّل دخول بالفعل**،
   وده بالظبط اللي التوكن الموقّع بيمثّله. */
function makeCaregiver(label) {
  const pool = require('../db');
  const jwt = require('jsonwebtoken');
  const stamp = `${Date.now()}`.slice(-6) + Math.floor(Math.random() * 900 + 100);

  return pool
    .query(`INSERT INTO users (name, role, phone, password_hash) VALUES (?, 'caregiver', ?, 'x')`, [
      `متابع ${label}`,
      `01${stamp}`.slice(0, 15),
    ])
    .then(([result]) => {
      cleanupUserIds.push(result.insertId);
      return {
        id: result.insertId,
        token: jwt.sign({ id: result.insertId, role: 'caregiver', name: `متابع ${label}` },
          process.env.JWT_SECRET, { expiresIn: '7d' }),
      };
    });
}

/* بيجهّز متابع + مريض + توكن دخول المريض. بيرجّع كل اللي التيستات تحته محتاجاه. */
async function seedCircle(label) {
  const cg = await makeCaregiver(label);
  const caregiver = { body: { user: { id: cg.id }, token: cg.token } };

  const patient = await api(baseUrl, '/api/patients', {
    method: 'POST',
    token: caregiver.body.token,
    body: { name: `مريض ${label}` },
  });
  cleanupUserIds.push(patient.body.patient.id);

  const access = await api(baseUrl, '/api/auth/access', {
    method: 'POST',
    body: { token: patient.body.patient.access_token },
  });

  return {
    caregiverId: caregiver.body.user.id,
    caregiverToken: caregiver.body.token,
    patientId: patient.body.patient.id,
    patientToken: access.body.token,
    linkCode: patient.body.patient.link_code,
  };
}

test('المريض ما ينفعش يشيل متابعينه', async (t) => {
  if (!dbAvailable) {
    t.skip('قاعدة البيانات/الإعدادات مش متاحة في البيئة دي');
    return;
  }
  const c = await seedCircle('A');

  /* canAccessPatient لوحده بيمرّر المريض على نفسه، فالمريض كان يقدر يشيل
     متابعينه واحد واحد لحد ما يفضل من غير أي حد - ويفضل بياخد منبهات ومحدش
     شايف حالته. */
  const res = await api(baseUrl, `/api/patients/${c.patientId}/caregivers/${c.caregiverId}`, {
    method: 'DELETE',
    token: c.patientToken,
  });
  assert.equal(res.status, 403);
});

test('آخر متابع ما ينفعش يتشال - المريض ما يفضلش من غير حد', async (t) => {
  if (!dbAvailable) {
    t.skip('قاعدة البيانات/الإعدادات مش متاحة في البيئة دي');
    return;
  }
  const c = await seedCircle('B');

  // متابع تاني بينضم، بعدين بيحاول يشيل الأول (المفروض يعدي - لسه فيه اتنين)
  const secondCg = await makeCaregiver('تاني');
  const second = { body: { user: { id: secondCg.id }, token: secondCg.token } };
  await api(baseUrl, '/api/patients/link', {
    method: 'POST',
    token: second.body.token,
    body: { code: c.linkCode },
  });

  const removeFirst = await api(
    baseUrl,
    `/api/patients/${c.patientId}/caregivers/${c.caregiverId}`,
    { method: 'DELETE', token: second.body.token }
  );
  assert.equal(removeFirst.status, 200, 'شيل متابع وفيه غيره المفروض يعدي');

  // ودلوقتي هو آخر واحد - مفيش طريقة يشيل نفسه ولا غيره
  const removeLast = await api(
    baseUrl,
    `/api/patients/${c.patientId}/caregivers/${second.body.user.id}`,
    { method: 'DELETE', token: second.body.token }
  );
  assert.ok(removeLast.status >= 400, 'آخر متابع ما ينفعش يتشال');

  const pool = require('../db');
  const [[left]] = await pool.query(
    'SELECT COUNT(*) AS n FROM patient_caregiver WHERE patient_id = ?',
    [c.patientId]
  );
  assert.equal(Number(left.n), 1, 'مستحيل المريض يفضل من غير أي متابع');
});

test('البلاغ بيتبعت من المريض بس - مش من المتابع باسمه', async (t) => {
  if (!dbAvailable) {
    t.skip('قاعدة البيانات/الإعدادات مش متاحة في البيئة دي');
    return;
  }
  const c = await seedCircle('C');

  /* الرسالة بتتكتب "فلان بلّغ إن..." - فالمتابع كان يقدر يولّد سجل بيقول إن
     المريض بلّغ بينما هو عمره ما عمل حاجة. */
  const fromCaregiver = await api(baseUrl, `/api/patients/${c.patientId}/report-issue`, {
    method: 'POST',
    token: c.caregiverToken,
    body: { issueType: 'want_call' },
  });
  assert.equal(fromCaregiver.status, 403);

  const fromPatient = await api(baseUrl, `/api/patients/${c.patientId}/report-issue`, {
    method: 'POST',
    token: c.patientToken,
    body: { issueType: 'want_call' },
  });
  assert.equal(fromPatient.status, 201);
});

test('القراءة الخطرة بتوصل للمتابع كتنبيه حرج', async (t) => {
  if (!dbAvailable) {
    t.skip('قاعدة البيانات/الإعدادات مش متاحة في البيئة دي');
    return;
  }
  const c = await seedCircle('D');

  /* RANGES بتتأكد إن الرقم **منطقي** مش إنه **خطر**. فالمريض كان يسجّل ضغط
     200/130 والتطبيق يقبله في صمت - والمتابع عمره ما يعرف إلا لو فتح تاب
     القياسات بنفسه. */
  const danger = await api(baseUrl, '/api/vitals', {
    method: 'POST',
    token: c.patientToken,
    body: { patientId: c.patientId, type: 'blood_pressure', value: { systolic: 200, diastolic: 130 } },
  });
  assert.equal(danger.status, 201);
  assert.ok(danger.body.alert, 'القراءة الخطرة لازم ترجع وصف');

  const normal = await api(baseUrl, '/api/vitals', {
    method: 'POST',
    token: c.patientToken,
    body: { patientId: c.patientId, type: 'blood_pressure', value: { systolic: 120, diastolic: 80 } },
  });
  assert.equal(normal.body.alert, null, 'القراءة العادية مبتولّدش أي تنبيه');

  const pool = require('../db');
  const [rows] = await pool.query(
    "SELECT priority FROM notifications WHERE user_id = ? AND type = 'patient_issue'",
    [c.caregiverId]
  );
  assert.equal(rows.length, 1, 'تنبيه واحد بس - للقراءة الخطرة');
  // حرج عشان يخترق ساعات الهدوء: ضغط 200/130 الساعة 2 بالليل مش هيستنى الصبح
  assert.equal(rows[0].priority, 'critical');
});

test('كمية الدوا بتنقص مع الجرعة وبتنبّه قبل ما تخلص', async (t) => {
  if (!dbAvailable) {
    t.skip('قاعدة البيانات/الإعدادات مش متاحة في البيئة دي');
    return;
  }
  const c = await seedCircle('E');
  const pool = require('../db');
  const { cairoToday } = require('../utils/time');

  const med = await api(baseUrl, '/api/medications', {
    method: 'POST',
    token: c.caregiverToken,
    body: {
      patientId: c.patientId,
      name: 'دوا الكمية',
      times: ['08:00'],
      startDate: cairoToday(),
      pillsLeft: 6,
    },
  });
  assert.equal(med.status, 201);

  const [doses] = await pool.query('SELECT id FROM doses WHERE medication_id = ? LIMIT 1', [
    med.body.id,
  ]);
  await pool.query('UPDATE doses SET scheduled_at = NOW() WHERE id = ?', [doses[0].id]);

  const take = await api(baseUrl, `/api/doses/${doses[0].id}/take`, {
    method: 'POST',
    token: c.caregiverToken,
  });
  assert.equal(take.status, 200);

  const [[after]] = await pool.query('SELECT pills_left FROM medications WHERE id = ?', [med.body.id]);
  assert.equal(Number(after.pills_left), 5, 'الكمية لازم تنقص جرعة واحدة');

  const [alerts] = await pool.query(
    "SELECT message FROM notifications WHERE user_id = ? AND message LIKE '%قرب يخلص%'",
    [c.caregiverId]
  );
  assert.equal(alerts.length, 1, 'المتابع لازم يتنبّه قبل ما الدوا يخلص - مش بعده');
});

test('هيدرات الأمان موجودة على كل رد', async (t) => {
  if (!dbAvailable) {
    t.skip('قاعدة البيانات/الإعدادات مش متاحة في البيئة دي');
    return;
  }
  const res = await fetch(`${baseUrl}/`);
  const csp = res.headers.get('content-security-policy') || '';

  assert.ok(csp, 'لازم يكون فيه CSP - التوكن متخزّن في localStorage فأي XSS بياخد الحساب');
  assert.match(csp, /frame-ancestors 'none'/, 'منع التضمين في iframe');
  assert.match(csp, /default-src 'self'/);
  /* السكريبتات الـ inline في index.html (تحديد المظهر قبل أول رسم + تسجيل الـ
     Service Worker) بتعدّي ببصمة SHA-256 محسوبة من الملف نفسه، مش بـ
     'unsafe-inline' اللي بيلغي أهم حماية في الـ CSP كلها. */
  assert.match(csp, /sha256-/, 'البصمات لازم تكون محسوبة ومحطوطة في السياسة');
  assert.ok(!csp.includes("script-src 'self' 'unsafe-inline'"), 'ممنوع unsafe-inline للسكريبتات');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});
