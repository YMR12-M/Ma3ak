const pool = require('../db');

// بيتأكد إن المستخدم الحالي (مريض هو نفسه، أو متابع مربوط) يقدر يشوف/يعدل بيانات مريض معين
async function canAccessPatient(user, patientId) {
  patientId = Number(patientId);
  if (Number.isNaN(patientId)) return false;

  if (user.role === 'patient') {
    return user.id === patientId;
  }

  const [rows] = await pool.query(
    'SELECT id FROM patient_caregiver WHERE patient_id = ? AND caregiver_id = ?',
    [patientId, user.id]
  );
  return rows.length > 0;
}

module.exports = { canAccessPatient };
