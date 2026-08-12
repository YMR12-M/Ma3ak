const pool = require('./db');

const GRACE_MINUTES = 30; // بعد ما ميعاد الجرعة يعدي بالوقت ده من غير تسجيل، بتتحسب "فايتة"
const RUN_INTERVAL_MS = 5 * 60 * 1000; // كل 5 دقايق

function pad(n) {
  return String(n).padStart(2, '0');
}

function toMysqlDatetime(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:00`;
}

function timeStringToDate(dayBase, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(dayBase);
  d.setHours(h, m, 0, 0);
  return d;
}

// بيولّد صفوف الجرعات المتوقعة (اليوم وبكرة) لدواء واحد بعينه
async function generateDosesForMedication(med) {
  const times = typeof med.times === 'string' ? JSON.parse(med.times) : med.times;
  const startDate = new Date(med.start_date);

  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  for (const dayBase of [today, tomorrow]) {
    for (const t of times) {
      const scheduled = timeStringToDate(dayBase, t);
      if (scheduled < startDate) continue;
      if (med.end_date && scheduled > new Date(`${med.end_date}T23:59:59`)) continue;

      try {
        await pool.query(
          `INSERT IGNORE INTO doses (medication_id, patient_id, scheduled_at, status)
           VALUES (?, ?, ?, 'pending')`,
          [med.id, med.patient_id, toMysqlDatetime(scheduled)]
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
    `SELECT * FROM medications WHERE active = 1 AND (end_date IS NULL OR end_date >= CURDATE())`
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
     WHERE d.status = 'pending' AND d.scheduled_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [GRACE_MINUTES]
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
    `SELECT * FROM appointments WHERE appointment_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 24 HOUR)`
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
