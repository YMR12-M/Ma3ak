const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// يوقف محاولات تجربة الباسورد بالجملة (brute force) على /login و /access
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'محاولات كتير في وقت قصير، جرب تاني بعد شوية' },
});

// أقل صرامة، بس بيمنع تسجيل حسابات بالجملة من IP واحد
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // ساعة
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'محاولات تسجيل كتير في وقت قصير، جرب تاني بعد شوية' },
});

// تسجيل متابع جديد (ابن/بنت/ممرض). الموبايل إجباري (هو معرّف الدخول)، الإيميل اختياري.
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    const role = 'caregiver'; // المرضى بيتضافوا من المتابع نفسه، مش عن طريق تسجيل مباشر

    if (!name || !password || !phone) {
      return res.status(400).json({ error: 'من فضلك اكتب الاسم ورقم الموبايل وكلمة المرور' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'كلمة المرور لازم تكون 6 حروف على الأقل' });
    }

    const [existingPhone] = await pool.query('SELECT id FROM users WHERE phone = ?', [phone]);
    if (existingPhone.length) {
      return res.status(409).json({ error: 'رقم الموبايل ده مسجل قبل كده' });
    }
    if (email) {
      const [existingEmail] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
      if (existingEmail.length) {
        return res.status(409).json({ error: 'الإيميل ده مسجل قبل كده' });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role, phone) VALUES (?, ?, ?, ?, ?)',
      [name, email || null, passwordHash, role, phone]
    );

    const token = signToken({ id: result.insertId, role, name });
    res.status(201).json({
      token,
      user: { id: result.insertId, name, email: email || null, role, phone },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'حصل خطأ في التسجيل' });
  }
});

// تسجيل الدخول: identifier ممكن يكون رقم موبايل أو إيميل
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ error: 'اكتب رقم الموبايل أو الإيميل وكلمة المرور' });
    }
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE (phone = ? OR email = ?) AND password_hash IS NOT NULL',
      [identifier, identifier]
    );
    if (!rows.length) {
      return res.status(401).json({ error: 'البيانات غير صحيحة' });
    }
    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
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
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'حصل خطأ في تسجيل الدخول' });
  }
});

// دخول المريض عن طريق "لينك الدخول" (بدون باسورد خالص) - ده اللي بيحصل لما المريض يفتح اللينك
router.post('/access', loginLimiter, async (req, res) => {
  try {
    const { token: accessToken } = req.body;
    if (!accessToken) {
      return res.status(400).json({ error: 'اللينك غير صالح' });
    }
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE access_token = ? AND role = "patient"',
      [accessToken]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'اللينك ده مش شغال، اطلب واحد جديد من اللي بيتابعك' });
    }
    const user = rows[0];
    const token = signToken({ id: user.id, role: user.role, name: user.name });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'حصل خطأ في الدخول' });
  }
});

router.get('/me', authRequired, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, name, email, role, phone FROM users WHERE id = ?',
    [req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'مستخدم غير موجود' });
  res.json({ user: rows[0] });
});

module.exports = router;
