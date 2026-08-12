const express = require('express');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');
const { canAccessPatient } = require('../utils/access');
const { generateUniqueLinkCode, generateUniqueAccessToken } = require('../utils/codes');

const router = express.Router();

// المتابع بيضيف مريض جديد بنفسه (اسم + موبايل اختياري) - المريض مش لازم يعمل أي حاجة
router.post('/', authRequired, async (req, res) => {
  if (req.user.role !== 'caregiver') {
    return res.status(403).json({ error: 'المتابعين بس اللي يقدروا يضيفوا مريض' });
  }
  const { name, phone } = req.body;
  if (!name) return res.status(400).json({ error: 'من فضلك اكتب اسم المريض' });

  if (phone) {
    const [dup] = await pool.query('SELECT id FROM users WHERE phone = ?', [phone]);
    if (dup.length) return res.status(409).json({ error: 'رقم الموبايل ده مسجل قبل كده' });
  }

  const linkCode = await generateUniqueLinkCode();
  const accessToken = await generateUniqueAccessToken();

  const [result] = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, phone, link_code, access_token)
     VALUES (?, NULL, NULL, 'patient', ?, ?, ?)`,
    [name, phone || null, linkCode, accessToken]
  );

  await pool.query(
    'INSERT INTO patient_caregiver (patient_id, caregiver_id) VALUES (?, ?)',
    [result.insertId, req.user.id]
  );

  res.status(201).json({
    patient: {
      id: result.insertId,
      name,
      phone: phone || null,
      link_code: linkCode,
      access_token: accessToken,
    },
  });
});

// متابع تاني بينضم لمتابعة مريض موجود بالفعل عن طريق كود المشاركة
router.post('/link', authRequired, async (req, res) => {
  if (req.user.role !== 'caregiver') {
    return res.status(403).json({ error: 'المتابعين بس اللي ممكن يربطوا مريض' });
  }
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'من فضلك اكتب كود المشاركة' });

  const [rows] = await pool.query(
    'SELECT * FROM users WHERE link_code = ? AND role = "patient"',
    [String(code).toUpperCase()]
  );
  if (!rows.length) return res.status(404).json({ error: 'الكود غير صحيح' });
  const patient = rows[0];

  try {
    await pool.query(
      'INSERT INTO patient_caregiver (patient_id, caregiver_id) VALUES (?, ?)',
      [patient.id, req.user.id]
    );
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'انت متابع للمريض ده بالفعل' });
    }
    console.error(e);
    return res.status(500).json({ error: 'حصل خطأ في الربط' });
  }

  res.status(201).json({ patient: { id: patient.id, name: patient.name, phone: patient.phone } });
});

// تصنيفات المشاكل اللي المريض ممكن يبلّغ عنها من زرار "حصلت مشكلة؟"
const ISSUE_LABELS = {
  med_finished: 'الدوا خلص وعايز عبوة جديدة',
  forgot_dose: 'نسي ياخد جرعة',
  side_effect: 'حاسس بتعب أو حاجة غريبة بعد الدوا',
  unclear_dose: 'مش متأكد إزاي ياخد الدوا',
  want_call: 'عايز حد يتصل بيه دلوقتي',
  other: 'عنده مشكلة تانية',
};

// المريض بيبلّغ عن مشكلة بضغطة واحدة - بتوصل إشعار لكل المتابعين بتوعه فورًا
router.post('/:id/report-issue', authRequired, async (req, res) => {
  const patientId = req.params.id;
  if (!(await canAccessPatient(req.user, patientId))) {
    return res.status(403).json({ error: 'مفيش صلاحية' });
  }

  const { issueType, medicationName } = req.body;
  const label = ISSUE_LABELS[issueType];
  if (!label) return res.status(400).json({ error: 'نوع المشكلة غير معروف' });

  const [patientRows] = await pool.query('SELECT name FROM users WHERE id = ?', [patientId]);
  const patientName = patientRows.length ? patientRows[0].name : 'المريض';

  const message =
    issueType === 'med_finished' && medicationName
      ? `${patientName} بلّغ إن دوا "${medicationName}" خلص وعايز عبوة جديدة`
      : `${patientName} بلّغ: ${label}`;

  const [caregivers] = await pool.query(
    'SELECT caregiver_id FROM patient_caregiver WHERE patient_id = ?',
    [patientId]
  );
  for (const c of caregivers) {
    await pool.query(
      `INSERT INTO notifications (user_id, patient_id, type, message) VALUES (?, ?, 'patient_issue', ?)`,
      [c.caregiver_id, patientId, message]
    );
  }

  res.status(201).json({ ok: true, notified: caregivers.length });
});

// توليد لينك دخول جديد للمريض (يلغي القديم - مفيد لو اللينك القديم اتسرب)
router.post('/:id/regenerate-link', authRequired, async (req, res) => {
  const patientId = req.params.id;
  if (!(await canAccessPatient(req.user, patientId))) {
    return res.status(403).json({ error: 'مفيش صلاحية' });
  }
  const accessToken = await generateUniqueAccessToken();
  await pool.query('UPDATE users SET access_token = ? WHERE id = ? AND role = "patient"', [
    accessToken,
    patientId,
  ]);
  res.json({ access_token: accessToken });
});

// المرضى المرتبطين بالمستخدم الحالي (المريض نفسه، أو مرضى المتابع)
router.get('/', authRequired, async (req, res) => {
  if (req.user.role === 'patient') {
    const [rows] = await pool.query(
      'SELECT id, name, email, phone FROM users WHERE id = ?',
      [req.user.id]
    );
    return res.json({ patients: rows });
  }

  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, u.link_code, u.access_token
     FROM users u
     JOIN patient_caregiver pc ON pc.patient_id = u.id
     WHERE pc.caregiver_id = ?
     ORDER BY u.name ASC`,
    [req.user.id]
  );
  res.json({ patients: rows });
});

module.exports = router;
