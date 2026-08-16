const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const { loginLimiter, accessLimiter, registerLimiter } = require('../middleware/rateLimit');
const { LIMITS, isNonEmptyString, isTooLong } = require('../utils/validate');

const router = express.Router();

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
}

/* هاش وهمي لكلمة مرور مش بتساوي حاجة. بنقارن بيه لما المستخدم مش موجود أصلاً،
   عشان الرد ياخد نفس الوقت تقريبًا سواء الرقم مسجّل أو لأ. من غير كده، فرق
   التوقيت لوحده كان بيقول للمهاجم "الرقم ده مسجّل عندنا" - وده تسريب لقائمة
   عملاء التطبيق (مين مسجّل ومين لأ) من غير ما يعرف أي كلمة مرور. */
const DUMMY_HASH = bcrypt.hashSync('ma3ak-timing-equalizer', 10);

// تسجيل متابع جديد (ابن/بنت/ممرض). الموبايل إجباري (هو معرّف الدخول)، الإيميل اختياري.
router.post(
  '/register',
  registerLimiter,
  asyncHandler(async (req, res) => {
    const { name, email, password, phone } = req.body;
    const role = 'caregiver'; // المرضى بيتضافوا من المتابع نفسه، مش عن طريق تسجيل مباشر

    if (!isNonEmptyString(name) || !isNonEmptyString(password) || !isNonEmptyString(phone)) {
      return res.status(400).json({ error: 'من فضلك اكتب الاسم ورقم الموبايل وكلمة المرور' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'كلمة المرور لازم تكون 6 حروف على الأقل' });
    }
    if (isTooLong(password, LIMITS.password)) {
      return res.status(400).json({ error: 'كلمة المرور طويلة أوي' });
    }
    if (isTooLong(name, LIMITS.userName)) {
      return res.status(400).json({ error: `الاسم طويل أوي (أقصى ${LIMITS.userName} حرف)` });
    }
    if (isTooLong(phone, LIMITS.phone)) {
      return res.status(400).json({ error: 'رقم الموبايل مش مكتوب صح' });
    }
    if (email && isTooLong(email, LIMITS.email)) {
      return res.status(400).json({ error: 'الإيميل طويل أوي' });
    }

    const cleanName = name.trim();
    const cleanPhone = phone.trim();
    const cleanEmail = isNonEmptyString(email) ? email.trim() : null;

    const [existingPhone] = await pool.query('SELECT id FROM users WHERE phone = ?', [cleanPhone]);
    if (existingPhone.length) {
      return res.status(409).json({ error: 'رقم الموبايل ده مسجل قبل كده' });
    }
    if (cleanEmail) {
      const [existingEmail] = await pool.query('SELECT id FROM users WHERE email = ?', [cleanEmail]);
      if (existingEmail.length) {
        return res.status(409).json({ error: 'الإيميل ده مسجل قبل كده' });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role, phone) VALUES (?, ?, ?, ?, ?)',
      [cleanName, cleanEmail, passwordHash, role, cleanPhone]
    );

    const token = signToken({ id: result.insertId, role, name: cleanName });
    res.status(201).json({
      token,
      user: { id: result.insertId, name: cleanName, email: cleanEmail, role, phone: cleanPhone },
    });
  })
);

// تسجيل الدخول: identifier ممكن يكون رقم موبايل أو إيميل
router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { identifier, password } = req.body;
    if (!isNonEmptyString(identifier) || !isNonEmptyString(password)) {
      return res.status(400).json({ error: 'اكتب رقم الموبايل أو الإيميل وكلمة المرور' });
    }
    const cleanIdentifier = identifier.trim();
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE (phone = ? OR email = ?) AND password_hash IS NOT NULL',
      [cleanIdentifier, cleanIdentifier]
    );

    const user = rows[0];
    // بنقارن دايمًا - بالهاش الحقيقي لو المستخدم موجود، وبالوهمي لو مش موجود -
    // عشان الحالتين ياخدوا نفس الوقت (شوف تعليق DUMMY_HASH فوق)
    const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) {
      return res.status(401).json({ error: 'البيانات غير صحيحة' });
    }

    const token = signToken({ id: user.id, role: user.role, name: user.name });
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
      },
    });
  })
);

// دخول المريض عن طريق "لينك الدخول" (بدون باسورد خالص) - ده اللي بيحصل لما المريض يفتح اللينك
router.post(
  '/access',
  accessLimiter,
  asyncHandler(async (req, res) => {
    const { token: accessToken } = req.body;
    if (!isNonEmptyString(accessToken)) {
      return res.status(400).json({ error: 'اللينك غير صالح' });
    }
    const [rows] = await pool.query('SELECT * FROM users WHERE access_token = ? AND role = "patient"', [
      accessToken.trim(),
    ]);
    if (!rows.length) {
      return res.status(404).json({ error: 'اللينك ده مش شغال، اطلب واحد جديد من اللي بيتابعك' });
    }
    const user = rows[0];
    const token = signToken({ id: user.id, role: user.role, name: user.name });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone },
    });
  })
);

router.get(
  '/me',
  authRequired,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT id, name, email, role, phone FROM users WHERE id = ?', [
      req.user.id,
    ]);
    if (!rows.length) return res.status(404).json({ error: 'مستخدم غير موجود' });
    res.json({ user: rows[0] });
  })
);

module.exports = router;
