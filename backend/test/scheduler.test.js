/* اختبار generateDosesForMedication - المسؤولة إنها تحول times ["08:00","20:00"] لصفوف
   جرعات فعلية كل يوم. غلطة هنا يعني جرعات متولدتش خالص (المريض ملوش زرار يضغط عليه)،
   أو اتولدت في يوم غلط. بنعمل mock لـ pool.query ونلتقط كل INSERT بدل ما نحتاج قاعدة حقيقية. */
const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../db');
const { generateDosesForMedication } = require('../scheduler');

/* "النهاردة" هنا لازم تكون بتوقيت مصر، مش بتوقيت الجهاز اللي بيشغّل التيست -
   لأن generateDosesForMedication نفسها شغالة بتوقيت مصر. لو استخدمنا تاريخ
   الجهاز، الاختبارات دي بتنجح في مصر وتفشل على أي جهاز بتوقيت تاني (زي
   GitHub Actions اللي شغال UTC): في الساعات اللي بين منتصف الليل في مصر
   ومنتصف الليل في UTC، الاتنين بيبقوا في يومين مختلفين خالص. */
function todayStr(offsetDays = 0) {
  const cairoToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
  const [y, m, d] = cairoToday.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
}

function captureInserts(t) {
  const calls = [];
  t.mock.method(pool, 'query', async (sql, params) => {
    calls.push(params);
    return [{}];
  });
  return calls;
}

test('دواء بميعاد واحد وبدون تاريخ نهاية - بيولّد جرعة النهارده وبكرة (صفين)', async (t) => {
  const calls = captureInserts(t);
  await generateDosesForMedication({
    id: 1,
    patient_id: 2,
    times: ['08:00'],
    start_date: todayStr(-30), // بدأ من زمان، مش عائق
    end_date: null,
  });
  assert.equal(calls.length, 2);
  assert.match(calls[0][2], /^\d{4}-\d{2}-\d{2} 08:00:00$/); // شكل التاريخ اللي مايسكيوإل بيفهمه
});

test('دواء بمواعيد متعددة - بيضرب عدد المواعيد في يومين (اليوم وبكرة)', async (t) => {
  const calls = captureInserts(t);
  await generateDosesForMedication({
    id: 1,
    patient_id: 2,
    times: ['08:00', '14:00', '20:00'],
    start_date: todayStr(-30),
    end_date: null,
  });
  assert.equal(calls.length, 6); // 3 مواعيد × يومين
});

test('times كسترينج JSON (زي ما بيجي من قاعدة البيانات) بيتفسّر صح', async (t) => {
  const calls = captureInserts(t);
  await generateDosesForMedication({
    id: 1,
    patient_id: 2,
    times: '["09:00"]', // مش array حقيقي - سترينج زي اللي راجع من MySQL JSON column أحيانًا
    start_date: todayStr(-30),
    end_date: null,
  });
  assert.equal(calls.length, 2);
});

test('تاريخ البداية بكرة - بيتخطى جرعة النهارده وبيولّد بكرة بس', async (t) => {
  const calls = captureInserts(t);
  await generateDosesForMedication({
    id: 1,
    patient_id: 2,
    times: ['08:00'],
    start_date: todayStr(1), // يبدأ بكرة
    end_date: null,
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0][2], new RegExp(`^${todayStr(1)} 08:00:00$`));
});

test('تاريخ النهاية إمبارح - الدواء خلص، مفيش جرعات جديدة خالص', async (t) => {
  const calls = captureInserts(t);
  await generateDosesForMedication({
    id: 1,
    patient_id: 2,
    times: ['08:00'],
    start_date: todayStr(-30),
    end_date: todayStr(-1), // خلص إمبارح
  });
  assert.equal(calls.length, 0);
});

test('تاريخ النهاية النهارده - بيولّد جرعة النهارده بس مش بكرة', async (t) => {
  const calls = captureInserts(t);
  await generateDosesForMedication({
    id: 1,
    patient_id: 2,
    times: ['08:00'],
    start_date: todayStr(-30),
    end_date: todayStr(0),
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0][2], new RegExp(`^${todayStr(0)} 08:00:00$`));
});
