/* اختبار خط المنبه الزمني كامل على قاعدة بيانات حقيقية.

   ده أهم اختبار في الميزة: الجرعة مش "إشعار بيتبعت مرة"، دي حالة بتتصعّد -
   منبه → تذكير → فاتت → تصعيد. كل مرحلة فيهم بتقرا وتكتب أعمدة مختلفة،
   وأي غلطة في شرط SQL واحد معناها يا إشعار بيتكرر كل دقيقة، يا مرحلة
   بتتخطى بالكامل من غير ما حد يلاحظ.

   وبنختبر كمان إن الإشعارات **مبتتكررش** لو الدورة اشتغلت أكتر من مرة -
   السيناريو ده حقيقي: الـ scheduler بيلف كل دقيقة، ولو منع التكرار مش
   شغال المريض بياخد نفس التنبيه 30 مرة.

   لو مفيش قاعدة بيانات متاحة التيست بيتخطى نفسه بدل ما يفشل.
*/
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = require('../db');
const {
  notifyDueDoses,
  notifyDoseReminders,
  markMissedAndNotify,
  escalateMissedDoses,
  notifyUpcomingAppointments,
  cleanupOldNotifications,
  NOTIFICATION_RETENTION_DAYS,
  REMINDER_MINUTES,
  GRACE_MINUTES,
  ESCALATE_AFTER_MISSED_MINUTES,
  MISSED_NOTIFY_MAX_LATE_MINUTES,
} = require('../scheduler');
const { generateDosesForMedication, cleanupStaleDoses } = require('../scheduler');
const { cairoNowPlusMinutes, cairoToday, cairoDateWithOffset, dayOfWeekIndex } = require('../utils/time');

let dbAvailable = false;
const cleanupUserIds = [];

before(async () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    console.log('  [scheduler-flow] JWT_SECRET مش مظبوط - تخطينا');
    return;
  }
  try {
    await pool.query('SELECT 1');
    dbAvailable = true;
  } catch (e) {
    console.log('  [scheduler-flow] قاعدة البيانات مش متاحة - تخطينا:', e.message);
  }
});

after(async () => {
  if (cleanupUserIds.length) {
    // حذف المستخدمين بيمسح معاه (CASCADE) كل الأدوية والجرعات والإشعارات
    await pool.query(
      `DELETE FROM users WHERE id IN (${cleanupUserIds.map(() => '?').join(',')})`,
      cleanupUserIds
    );
  }
  if (dbAvailable) await pool.end();
});

/* بيجهّز مريض + متابع + دوا + جرعة واحدة في ميعاد محدد بالنسبة لدلوقتي.
   بنكتب في قاعدة البيانات مباشرة (مش عن طريق الـ API) عشان نقدر نتحكم في
   scheduled_at بالظبط - وده اللي بيخلينا نختبر كل مرحلة زمنية من غير ما
   نستنى نص ساعة حقيقية. */
async function seed({ minutesAgo = 0, isCritical = 0, active = 1, daysOfWeek = 127 } = {}) {
  const suffix = Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000);

  const [patient] = await pool.query(
    `INSERT INTO users (name, role, link_code, access_token) VALUES (?, 'patient', ?, ?)`,
    [`مريض تيست ${suffix}`, `P${suffix}`.slice(0, 10), `tok${suffix}`]
  );
  const [caregiver] = await pool.query(
    `INSERT INTO users (name, role, phone, password_hash) VALUES (?, 'caregiver', ?, 'x')`,
    [`متابع تيست ${suffix}`, `09${suffix}`.slice(0, 15)]
  );
  cleanupUserIds.push(patient.insertId, caregiver.insertId);

  await pool.query('INSERT INTO patient_caregiver (patient_id, caregiver_id) VALUES (?, ?)', [
    patient.insertId,
    caregiver.insertId,
  ]);

  const [med] = await pool.query(
    `INSERT INTO medications (patient_id, name, times, days_of_week, start_date, active, is_critical, snooze_allowed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      patient.insertId,
      'دوا تيست',
      JSON.stringify(['08:00']),
      daysOfWeek,
      cairoToday(),
      active,
      isCritical,
      isCritical ? 0 : 1,
    ]
  );

  const scheduledAt = cairoNowPlusMinutes(-minutesAgo);
  const [dose] = await pool.query(
    `INSERT INTO doses (medication_id, patient_id, scheduled_at, status) VALUES (?, ?, ?, 'pending')`,
    [med.insertId, patient.insertId, scheduledAt]
  );

  return {
    patientId: patient.insertId,
    caregiverId: caregiver.insertId,
    medicationId: med.insertId,
    doseId: dose.insertId,
  };
}

async function notificationsFor(userId, type) {
  const [rows] = await pool.query(
    'SELECT * FROM notifications WHERE user_id = ? AND type = ? ORDER BY id',
    [userId, type]
  );
  return rows;
}

async function getDose(doseId) {
  const [rows] = await pool.query('SELECT * FROM doses WHERE id = ?', [doseId]);
  return rows[0];
}

/* ---------- المرحلة 1: وصل الميعاد ---------- */

test('وصل ميعاد الجرعة → منبه للمريض، ومفيش أي إزعاج للمتابع', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const { patientId, caregiverId, doseId } = await seed({ minutesAgo: 1 });

  await notifyDueDoses();

  const patientNotifs = await notificationsFor(patientId, 'dose_due');
  assert.equal(patientNotifs.length, 1);
  assert.equal(patientNotifs[0].priority, 'normal');
  assert.equal(patientNotifs[0].related_id, doseId);

  /* المتابع مش المفروض يترن عليه في كل جرعة - هو مش اللي بياخدها. متابع
     بيترن عليه 6 مرات في اليوم بيقفل الإشعارات، وساعتها المهم مش هيوصله. */
  const [caregiverNotifs] = await pool.query('SELECT * FROM notifications WHERE user_id = ?', [
    caregiverId,
  ]);
  assert.equal(caregiverNotifs.length, 0);

  // الطابع اتسجّل في قاعدة البيانات مش في الذاكرة - عشان إعادة تشغيل السيرفر
  // ما تعيدش إرسال نفس التنبيه (Render بينيّم الخدمة فعلاً)
  assert.ok((await getDose(doseId)).due_notified_at);
});

test('الدورة بتلف كل دقيقة - المنبه مبيتكررش', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const { patientId } = await seed({ minutesAgo: 1 });

  await notifyDueDoses();
  await notifyDueDoses();
  await notifyDueDoses();

  assert.equal((await notificationsFor(patientId, 'dose_due')).length, 1);
});

test('جرعة قديمة أوي (السيرفر كان نايم): مفيش منبه متأخر', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  // أقدم من فترة السماح كلها - دي مكانها مسار "فاتت" مش مسار المنبه
  const { patientId } = await seed({ minutesAgo: GRACE_MINUTES + 10 });

  await notifyDueDoses();

  assert.equal((await notificationsFor(patientId, 'dose_due')).length, 0);
});

/* ---------- المرحلة 2: التذكير التاني ---------- */

test('عدى وقت والجرعة لسه مستنية → تذكير تاني أقوى', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const { patientId, doseId } = await seed({ minutesAgo: REMINDER_MINUTES + 1 });

  await notifyDueDoses(); // الجرعة لسه جوه نافذة المنبه
  await notifyDoseReminders();

  assert.equal((await notificationsFor(patientId, 'dose_reminder')).length, 1);
  assert.ok((await getDose(doseId)).reminder_notified_at);

  // ومبيتكررش مع الدورة اللي بعدها
  await notifyDoseReminders();
  assert.equal((await notificationsFor(patientId, 'dose_reminder')).length, 1);
});

test('الجرعة في غفوة: مفيش تذكير - الغفوة نفسها هي التذكير', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const { patientId, doseId } = await seed({ minutesAgo: REMINDER_MINUTES + 1 });
  await notifyDueDoses();

  await pool.query('UPDATE doses SET snooze_until = ?, snooze_count = 1 WHERE id = ?', [
    cairoNowPlusMinutes(10),
    doseId,
  ]);

  await notifyDoseReminders();
  assert.equal((await notificationsFor(patientId, 'dose_reminder')).length, 0);
});

/* ---------- المرحلة 3: فاتت ---------- */

test('فترة السماح خلصت → "فاتت" + تنبيه للمتابع', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const { caregiverId, doseId } = await seed({ minutesAgo: GRACE_MINUTES + 1 });

  await markMissedAndNotify();

  assert.equal((await getDose(doseId)).status, 'missed');
  const notifs = await notificationsFor(caregiverId, 'missed_dose');
  assert.equal(notifs.length, 1);
  assert.equal(notifs[0].priority, 'normal');
});

/* دواء حرج فايت مش "خبر" - ده اللي التطبيق موجود عشانه. الأولوية الحرجة هي
   اللي بتخلي التنبيه يعدّي ساعات الهدوء. */
test('دوا مواعيده حرجة فات → التنبيه أولويته حرجة', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const { caregiverId } = await seed({ minutesAgo: GRACE_MINUTES + 1, isCritical: 1 });

  await markMissedAndNotify();

  const notifs = await notificationsFor(caregiverId, 'missed_dose');
  assert.equal(notifs.length, 1);
  assert.equal(notifs[0].priority, 'critical');
});

/* الغفوة بتأجّل، مش بتلغي - ومن غير الشرط ده الجرعة اللي المريض طلب تأجيلها
   كانت هتتحسب "فايتة" وهو مستني الرنة التانية */
test('جرعة في غفوة لميعاد جاي: مبتتحسبش فايتة', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const { doseId } = await seed({ minutesAgo: GRACE_MINUTES + 1 });
  await pool.query('UPDATE doses SET snooze_until = ? WHERE id = ?', [
    cairoNowPlusMinutes(9),
    doseId,
  ]);

  await markMissedAndNotify();

  assert.equal((await getDose(doseId)).status, 'pending');
});

/* ---------- المرحلة 4: التصعيد ---------- */

test('فاتت ومحدش تحرّك → تصعيد حرج للمتابع', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const { caregiverId, doseId } = await seed({
    minutesAgo: GRACE_MINUTES + ESCALATE_AFTER_MISSED_MINUTES + 1,
  });

  await markMissedAndNotify();
  await escalateMissedDoses();

  const notifs = await notificationsFor(caregiverId, 'dose_escalation');
  assert.equal(notifs.length, 1);
  // التصعيد حرج دايمًا، حتى لو الدوا نفسه مش "مهم": الموضوع هنا مبقاش عن
  // الجرعة، ده عن إن المريض نفسه مردّش على أي تنبيه
  assert.equal(notifs[0].priority, 'critical');
  assert.ok((await getDose(doseId)).escalated_at);

  // ومبيتكررش
  await escalateMissedDoses();
  assert.equal((await notificationsFor(caregiverId, 'dose_escalation')).length, 1);
});

test('الجرعة اتسجّلت متأخر قبل التصعيد: مفيش تصعيد', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const { caregiverId, doseId } = await seed({
    minutesAgo: GRACE_MINUTES + ESCALATE_AFTER_MISSED_MINUTES + 1,
  });
  await markMissedAndNotify();

  // المريض صحى متأخر وسجّلها (نافذة التسجيل المتأخر في doseLogic.js)
  await pool.query("UPDATE doses SET status = 'taken', taken_at = ? WHERE id = ?", [
    cairoNowPlusMinutes(0),
    doseId,
  ]);

  await escalateMissedDoses();
  assert.equal((await notificationsFor(caregiverId, 'dose_escalation')).length, 0);
});

/* التجميع: متابع بيتابع مريض فوّت 3 جرعات المفروض ياخد إشعار واحد يقول
   "فوّت 3 جرعات"، مش 3 إشعارات منفصلة - الإغراق بيخلي الشاشة كلها تتجاهل */
test('أكتر من جرعة فايتة لنفس المريض → تصعيد واحد مجمّع', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const late = GRACE_MINUTES + ESCALATE_AFTER_MISSED_MINUTES + 5;
  const { patientId, caregiverId, doseId } = await seed({ minutesAgo: late });

  /* جرعتين كمان لنفس المريض ونفس الدواء في مواعيد مختلفة - كلهم **جوه نافذة
     التصعيد** (MISSED_NOTIFY_MAX_LATE_MINUTES). الجرعة الأقدم من النافذة ليها
     تيست منفصل تحت. */
  const [[dose]] = await pool.query('SELECT medication_id FROM doses WHERE id = ?', [doseId]);
  for (const extra of [late + 20, late + 40]) {
    await pool.query(
      `INSERT INTO doses (medication_id, patient_id, scheduled_at, status) VALUES (?, ?, ?, 'pending')`,
      [dose.medication_id, patientId, cairoNowPlusMinutes(-extra)]
    );
  }

  await markMissedAndNotify();
  await escalateMissedDoses();

  const notifs = await notificationsFor(caregiverId, 'dose_escalation');
  assert.equal(notifs.length, 1, 'المفروض إشعار تصعيد واحد مجمّع مش تلاتة');
  assert.match(notifs[0].message, /3 جرعات/);
});

/* ---------- السيرفر كان نايم ----------
   مسار "فاتت" والتصعيد مكانش لهم أي سقف من ناحية الماضي، فأول ما السيرفر يقوم
   من النوم (خطة Render المجانية بتنيّمه بعد 15 دقيقة) كان بيلمّ كل اللي فات
   ويبعته دفعة واحدة - 6 إشعارات "جرعة فاتت" في نفس الدقيقة على متابع واحد.
   وده بالظبط اللي utils/notify.js مكتوب عشان يمنعه. */

test('السيرفر كان نايم: الجرعات القديمة بتتعلّم فايتة بإشعار واحد مجمّع', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const veryLate = MISSED_NOTIFY_MAX_LATE_MINUTES + 60;
  const { patientId, caregiverId, doseId } = await seed({ minutesAgo: veryLate });

  const [[dose]] = await pool.query('SELECT medication_id FROM doses WHERE id = ?', [doseId]);
  for (const extra of [veryLate + 60, veryLate + 120]) {
    await pool.query(
      `INSERT INTO doses (medication_id, patient_id, scheduled_at, status) VALUES (?, ?, ?, 'pending')`,
      [dose.medication_id, patientId, cairoNowPlusMinutes(-extra)]
    );
  }

  await markMissedAndNotify();

  // الحالة في قاعدة البيانات لازم تفضل صح - التقرير بيقرا منها
  const [[counts]] = await pool.query(
    "SELECT COUNT(*) AS n FROM doses WHERE patient_id = ? AND status = 'missed'",
    [patientId]
  );
  assert.equal(Number(counts.n), 3, 'كل الجرعات لازم تتعلّم فايتة');

  // بس إشعار واحد مجمّع، مش تلاتة
  const notifs = await notificationsFor(caregiverId, 'missed_dose');
  assert.equal(notifs.length, 1, 'المفروض إشعار واحد مجمّع مش واحد لكل جرعة');
  assert.match(notifs[0].message, /3 جرعات/);
});

test('الجرعة الأقدم من نافذة التصعيد مبتولّدش "اطمن عليه"', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const { caregiverId } = await seed({ minutesAgo: MISSED_NOTIFY_MAX_LATE_MINUTES + 60 });

  await markMissedAndNotify();
  await escalateMissedDoses();

  /* التصعيد معناه "اطمن عليه حالًا" - وده مالوش أي معنى على جرعة فات ميعادها
     من ساعات ومحدش بعت عنها تنبيه أصلاً. */
  const notifs = await notificationsFor(caregiverId, 'dose_escalation');
  assert.equal(notifs.length, 0, 'مفيش تصعيد على جرعة قديمة أوي');
});

/* ---------- الدواء الموقوف ----------
   إيقاف الدواء بيعمل active = 0 وبس. من غير فلتر m.active في استعلامات الـ
   scheduler كان المنبه بيفضل يرنّ على المريض لدوا الدكتور وقّفه، والمتابع
   ياخد "جرعة فاتت" لدوا هو نفسه وقّفه. ده أخطر شكل للخطأ: كبير السن بياخد
   دوا موقوف لأن التطبيق قاله. */

test('دوا موقوف: مفيش منبه للمريض', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const { patientId } = await seed({ minutesAgo: 1, active: 0 });

  await notifyDueDoses();

  assert.equal((await notificationsFor(patientId, 'dose_due')).length, 0);
});

test('دوا موقوف: الجرعة مبتتحسبش فايتة ومفيش تنبيه للمتابع', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const { caregiverId, doseId } = await seed({ minutesAgo: GRACE_MINUTES + 1, active: 0 });

  await markMissedAndNotify();

  assert.equal((await getDose(doseId)).status, 'pending', 'دوا موقوف مبيولّدش جرعة فايتة');
  assert.equal((await notificationsFor(caregiverId, 'missed_dose')).length, 0);
});

test('إيقاف الدوا بيشيل جرعاته الجاية بس - اللي فات بيفضل تاريخ', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const { patientId, medicationId, doseId } = await seed({ minutesAgo: 120 });

  // جرعة جاية كمان لنفس الدوا
  const [future] = await pool.query(
    `INSERT INTO doses (medication_id, patient_id, scheduled_at, status) VALUES (?, ?, ?, 'pending')`,
    [medicationId, patientId, cairoNowPlusMinutes(180)]
  );

  const [[med]] = await pool.query('SELECT * FROM medications WHERE id = ?', [medicationId]);
  await cleanupStaleDoses({ ...med, active: 0 });

  const [rows] = await pool.query('SELECT id FROM doses WHERE medication_id = ?', [medicationId]);
  const ids = rows.map((r) => r.id);
  assert.ok(!ids.includes(future.insertId), 'الجرعة الجاية لازم تتشال');
  assert.ok(ids.includes(doseId), 'اللي فات ميعادها بيفضل - التقرير بيقرا منها');
});

test('تغيير مواعيد الدوا بيشيل صفوف الميعاد القديم', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const { patientId, medicationId } = await seed({ minutesAgo: 1 });

  // جرعة جاية بالميعاد القديم
  const [old] = await pool.query(
    `INSERT INTO doses (medication_id, patient_id, scheduled_at, status) VALUES (?, ?, ?, 'pending')`,
    [medicationId, patientId, `${cairoToday()} 08:00:00`]
  );
  await pool.query('UPDATE doses SET scheduled_at = ? WHERE id = ?', [
    cairoNowPlusMinutes(240),
    old.insertId,
  ]);

  // المتابع غيّر الميعاد لحاجة تانية خالص
  await pool.query('UPDATE medications SET times = ? WHERE id = ?', [
    JSON.stringify(['23:45']),
    medicationId,
  ]);
  const [[med]] = await pool.query('SELECT * FROM medications WHERE id = ?', [medicationId]);
  await cleanupStaleDoses(med);

  const [rows] = await pool.query('SELECT id FROM doses WHERE id = ?', [old.insertId]);
  assert.equal(rows.length, 0, 'صف الميعاد القديم لازم يتشال - وإلا بيرنّ ويتحسب فايت');
});

/* ---------- الغفوة بتمدّ فترة السماح ----------
   قبل كده الغفوة كانت بتأجّل الرنّة بس: notifyDueDoses بتصفّي snooze_until،
   وفي نفس الدورة markMissedAndNotify بتعلّم الجرعة فايتة. النتيجة كانت موبايل
   المريض بيقوله "وقت الدوا" وموبايل ابنه "فوّتها" في نفس الدقيقة. */

test('آخر رنّة غفوة: الجرعة مبتتحسبش فايتة في نفس الدورة', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const { patientId, caregiverId, doseId } = await seed({ minutesAgo: GRACE_MINUTES + 1 });

  // المريض أجّلها لآخر مرة، وميعاد الغفوة وصل دلوقتي
  await pool.query(
    `UPDATE doses SET snooze_until = ?, snooze_count = 3, due_notified_at = ?, reminder_notified_at = ?
      WHERE id = ?`,
    [cairoNowPlusMinutes(-1), cairoNowPlusMinutes(-30), cairoNowPlusMinutes(-20), doseId]
  );

  // دورة كاملة بنفس ترتيب runOnce
  await notifyDueDoses();
  await notifyDoseReminders();
  await markMissedAndNotify();

  assert.equal((await notificationsFor(patientId, 'dose_due')).length, 1, 'رنّة الغفوة لازم تحصل');
  assert.equal(
    (await notificationsFor(caregiverId, 'missed_dose')).length,
    0,
    'الغفوة لازم تمدّ فترة السماح - مش ترنّ وتتحسب فايتة مع بعض'
  );
  assert.equal((await getDose(doseId)).status, 'pending');
});

test('رنّة الغفوة مبتتكررش كل دقيقة', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const { patientId, doseId } = await seed({ minutesAgo: 20 });
  await pool.query(
    `UPDATE doses SET snooze_until = ?, snooze_count = 1, due_notified_at = ? WHERE id = ?`,
    [cairoNowPlusMinutes(-2), cairoNowPlusMinutes(-20), doseId]
  );

  await notifyDueDoses();
  await notifyDueDoses();
  await notifyDueDoses();

  assert.equal((await notificationsFor(patientId, 'dose_due')).length, 1);
});

test('الجرعة اللي في غفوة لسه جاية: مفيش رنّة ومفيش "فاتت"', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const { patientId, caregiverId, doseId } = await seed({ minutesAgo: GRACE_MINUTES + 5 });
  await pool.query(
    `UPDATE doses SET snooze_until = ?, snooze_count = 1, due_notified_at = ? WHERE id = ?`,
    [cairoNowPlusMinutes(8), cairoNowPlusMinutes(-35), doseId]
  );

  await notifyDueDoses();
  await markMissedAndNotify();

  assert.equal((await notificationsFor(patientId, 'dose_due')).length, 0);
  assert.equal((await notificationsFor(caregiverId, 'missed_dose')).length, 0);
  assert.equal((await getDose(doseId)).status, 'pending');
});

/* ---------- الجدولة الأسبوعية ----------
   قبل العمود ده كل دواء كان يومي بالضرورة، فالأدوية الأسبوعية (أليندرونات،
   ميثوتريكسات، حقن ب12) مكانش ينفع تتسجّل صح خالص. */

test('دوا أسبوعي: بيتولّد في يومه بس', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const todayIndex = dayOfWeekIndex(cairoToday());
  const otherIndex = (todayIndex + 3) % 7;

  const onToday = await seed({ daysOfWeek: 1 << todayIndex });
  const onOther = await seed({ daysOfWeek: 1 << otherIndex });

  // بنشيل جرعات الـ seed عشان نقيس التوليد لوحده
  await pool.query('DELETE FROM doses WHERE medication_id IN (?, ?)', [
    onToday.medicationId,
    onOther.medicationId,
  ]);

  for (const id of [onToday.medicationId, onOther.medicationId]) {
    const [[med]] = await pool.query('SELECT * FROM medications WHERE id = ?', [id]);
    await generateDosesForMedication(med);
  }

  const count = async (medId) => {
    const [[r]] = await pool.query(
      'SELECT COUNT(*) AS n FROM doses WHERE medication_id = ? AND DATE(scheduled_at) = ?',
      [medId, cairoToday()]
    );
    return Number(r.n);
  };

  assert.equal(await count(onToday.medicationId), 1, 'يوم مفعّل → جرعة');
  assert.equal(await count(onOther.medicationId), 0, 'يوم مقفول → مفيش جرعة');
});

test('دوا يومي (القناع الكامل): بيفضل يتولّد كل يوم زي ما كان', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const { medicationId } = await seed({ daysOfWeek: 127 });
  await pool.query('DELETE FROM doses WHERE medication_id = ?', [medicationId]);

  const [[med]] = await pool.query('SELECT * FROM medications WHERE id = ?', [medicationId]);
  await generateDosesForMedication(med);

  const [[r]] = await pool.query('SELECT COUNT(*) AS n FROM doses WHERE medication_id = ?', [
    medicationId,
  ]);
  assert.equal(Number(r.n), 2, 'النهاردة وبكرة - نفس السلوك القديم بالظبط');
});

/* ---------- المواعيد الطبية ---------- */

test('تعديل ميعاد الكشف بيطلّع تذكير جديد', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const { patientId, caregiverId } = await seed({ minutesAgo: 0 });

  const [appt] = await pool.query(
    `INSERT INTO appointments (patient_id, title, appointment_at) VALUES (?, ?, ?)`,
    [patientId, 'كشف قلب', cairoNowPlusMinutes(120)]
  );

  await notifyUpcomingAppointments();
  assert.equal((await notificationsFor(caregiverId, 'upcoming_appointment')).length, 1);

  // نفس الميعاد مرة تانية = مفيش تكرار
  await notifyUpcomingAppointments();
  assert.equal((await notificationsFor(caregiverId, 'upcoming_appointment')).length, 1);

  /* المتابع أجّل الكشف. قبل الإصلاح كان مفتاح منع التكرار `appt-<id>` ثابت،
     فالـ INSERT IGNORE كان بيرجّع صفر ومحدش بياخد تذكير بالميعاد الجديد -
     لا المريض ولا المتابع. */
  await pool.query('UPDATE appointments SET appointment_at = ? WHERE id = ?', [
    cairoNowPlusMinutes(300),
    appt.insertId,
  ]);

  await notifyUpcomingAppointments();
  const notifs = await notificationsFor(caregiverId, 'upcoming_appointment');
  assert.equal(notifs.length, 2, 'الميعاد الجديد لازم يطلّع تذكير جديد');
});

/* ---------- تنظيف الإشعارات ---------- */

test('التنظيف بيمسح المقروء القديم بس', async (t) => {
  if (!dbAvailable) return t.skip('قاعدة البيانات مش متاحة');
  const { patientId, caregiverId } = await seed({ minutesAgo: 0 });

  const old = `${cairoDateWithOffset(-(NOTIFICATION_RETENTION_DAYS + 5), '10:00')}`;
  async function insert(isRead, createdAt, message) {
    const [r] = await pool.query(
      `INSERT INTO notifications (user_id, patient_id, type, message, is_read, created_at)
       VALUES (?, ?, 'general', ?, ?, ?)`,
      [caregiverId, patientId, message, isRead, createdAt]
    );
    return r.insertId;
  }

  const oldRead = await insert(1, old, 'قديم ومقروء');
  const oldUnread = await insert(0, old, 'قديم ومش مقروء');
  const newRead = await insert(1, cairoNowPlusMinutes(0), 'جديد ومقروء');

  await cleanupOldNotifications(true);

  const [rows] = await pool.query('SELECT id FROM notifications WHERE user_id = ?', [caregiverId]);
  const ids = rows.map((r) => r.id);

  assert.equal(ids.includes(oldRead), false, 'القديم المقروء لازم يتمسح');
  /* الإشعار اللي المستخدم لسه مشافوش بيفضل مهما كان قديم: اختفاءه معناه إن
     حاجة حصلت ومحدش عرف بيها أبدًا. */
  assert.equal(ids.includes(oldUnread), true, 'القديم غير المقروء لازم يفضل');
  assert.equal(ids.includes(newRead), true, 'الجديد لازم يفضل');
});
