const pool = require('./db');
const { cairoToday, cairoDateWithOffset, cairoNowPlusMinutes } = require('./utils/time');

const GRACE_MINUTES = 30; // بعد ما ميعاد الجرعة يعدي بالوقت ده من غير تسجيل، بتتحسب "فايتة"
const RUN_INTERVAL_MS = 5 * 60 * 1000; // كل 5 دقايق

// بيولّد صفوف الجرعات المتوقعة (اليوم وبكرة) لدواء واحد بعينه.
// كل الحسابات هنا بتوقيت مصر (utils/time.js) - مش توقيت السيرفر اللي الكود
// شغال عليه فعليًا (Render/Railway غالبًا UTC) - عشان "اليوم" و"الميعاد" يبقوا
// مطابقين لساعة المستخدم الحقيقية.
async function generateDosesForMedication(med) {
  const times = typeof med.times === 'string' ? JSON.parse(med.times) : med.times;

  for (const daysOffset of [0, 1]) {
    for (const t of times) {
      const scheduled = cairoDateWithOffset(daysOffset, t);
      if (scheduled < `${med.start_date} 00:00:00`) continue;
      if (med.end_date && scheduled > `${med.end_date} 23:59:59`) continue;

      try {
        await pool.query(
          `INSERT IGNORE INTO doses (medication_id, patient_id, scheduled_at, status)
           VALUES (?, ?, ?, 'pending')`,
          [med.id, med.patient_id, scheduled]
        );
      } catch (e) {
        console.error('scheduler: generateDosesForMedication insert error:', e.message);
      }
    }
  }
}

// بيولّد صفوف الجرعات المتوقعة (اليوم وبكرة) لكل الأدوية النشطة
async function generateDoses() {
  const [meds] = await pool.query(
    `SELECT * FROM medications WHERE active = 1 AND (end_date IS NULL OR end_date >= ?)`,
    [cairoToday()]
  );
  for (const med of meds) {
    await generateDosesForMedication(med);
  }
}

async function getRecipients(patientId) {
  const [caregivers] = await pool.query(
    'SELECT caregiver_id FROM patient_caregiver WHERE patient_id = ?',
    [patientId]
  );
  return [patientId, ...caregivers.map((c) => c.caregiver_id)];
}

// أي جرعة "pending" عدى ميعادها + فترة السماح بتتحول "missed" ويتبعت إشعار
async function markMissedAndNotify() {
  const [rows] = await pool.query(
    `SELECT d.*, m.name AS med_name
     FROM doses d
     JOIN medications m ON m.id = d.medication_id
     WHERE d.status = 'pending' AND d.scheduled_at < ?`,
    [cairoNowPlusMinutes(-GRACE_MINUTES)]
  );

  for (const dose of rows) {
    await pool.query("UPDATE doses SET status = 'missed' WHERE id = ?", [dose.id]);

    const message = `فوّت جرعة "${dose.med_name}" المحددة الساعة ${dose.scheduled_at}`;
    const recipients = await getRecipients(dose.patient_id);
    for (const userId of recipients) {
      await pool.query(
        `INSERT INTO notifications (user_id, patient_id, type, related_id, message)
         VALUES (?, ?, 'missed_dose', ?, ?)`,
        [userId, dose.patient_id, dose.id, message]
      );
    }
  }
}

// إشعار بالمواعيد اللي هتيجي خلال 24 ساعة (مرة واحدة بس لكل موعد)
async function notifyUpcomingAppointments() {
  const [rows] = await pool.query(
    `SELECT * FROM appointments WHERE appointment_at BETWEEN ? AND ?`,
    [cairoNowPlusMinutes(0), cairoNowPlusMinutes(24 * 60)]
  );

  for (const appt of rows) {
    const [existing] = await pool.query(
      `SELECT id FROM notifications WHERE type = 'upcoming_appointment' AND related_id = ? AND patient_id = ?`,
      [appt.id, appt.patient_id]
    );
    if (existing.length) continue;

    const message = `تذكير: موعد "${appt.title}" غدًا الساعة ${appt.appointment_at}`;
    const recipients = await getRecipients(appt.patient_id);
    for (const userId of recipients) {
      await pool.query(
        `INSERT INTO notifications (user_id, patient_id, type, related_id, message)
         VALUES (?, ?, 'upcoming_appointment', ?, ?)`,
        [userId, appt.patient_id, appt.id, message]
      );
    }
  }
}

function startScheduler() {
  const run = async () => {
    try {
      await generateDoses();
      await markMissedAndNotify();
      await notifyUpcomingAppointments();
    } catch (e) {
      console.error('scheduler error:', e.message);
    }
  };
  run();
  setInterval(run, RUN_INTERVAL_MS);
  console.log(`scheduler: running every ${RUN_INTERVAL_MS / 60000} min`);
}

module.exports = { startScheduler, generateDosesForMedication };
