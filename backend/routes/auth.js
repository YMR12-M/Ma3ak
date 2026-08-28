const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const { loginLimiter, accessLimiter, registerLimiter } = require('../middleware/rateLimit');
const { LIMITS, isNonEmptyString, isTooLong } = require('../utils/validate');
const { generateRecoveryCode } = require('../utils/codes');

const router = express.Router();

/* ---------- مدة الجلسة ----------
   المتابع 7 أيام زي ما كانت. المريض **سنة**، وده فرق مقصود مش إهمال:

   المريض مالوش باسورد أصلاً - بيدخل بلينك سري. لما توكنه كان بينتهي بعد 7
   أيام، كان بيدوس على أيقونة التطبيق على شاشته الرئيسية ويلاقي شاشة تسجيل
   دخول بتطلب موبايل وباسورد **مالوش أي معنى بالنسبة له**، ومفيش قدامه غير
   إنه يكلّم ابنه يبعتله اللينك من الأول. لكبير سن ده مش "انتهت الجلسة"،
   ده "التطبيق باظ" - وكان بيحصل كل أسبوع.

   والمدة القصيرة مكانتش بتضيف أمان حقيقي: اللينك نفسه هو المفتاح، وهو موجود
   على الجهاز طول الوقت. الإلغاء الحقيقي بيحصل من "توليد لينك جديد" (بيغيّر
   access_token فبيبطّل كل التوكنات القديمة فورًا) - وده اللي المفروض
   يتستخدم لو اللينك اتسرب، مش انتظار انتهاء الصلاحية. */
const SESSION_DAYS = { caregiver: '7d', patient: '365d' };

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: SESSION_DAYS[payload.role] || '7d',
  });
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

    /* كود الاسترجاع بيتعرض **مرة واحدة بس** دلوقتي، وبيتخزّن مهشّور زي
       الباسورد. من غيره، المتابع اللي بينسى باسورده بيفقد وصوله لكل بيانات
       مريضه نهائيًا - مفيش إيميل ولا SMS في المشروع فمفيش أي طريقة تانية. */
    const recoveryCode = generateRecoveryCode();
    const recoveryHash = await bcrypt.hash(recoveryCode, 10);

    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, recovery_hash, role, phone) VALUES (?, ?, ?, ?, ?, ?)',
      [cleanName, cleanEmail, passwordHash, recoveryHash, role, cleanPhone]
    );

    const token = signToken({ id: result.insertId, role, name: cleanName });
    res.status(201).json({
      token,
      recoveryCode, // المرة الوحيدة اللي بيتبعت فيها - مبنخزّنش النص الأصلي
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

/* ---------- تغيير كلمة المرور ----------
   مكانش موجود خالص: المتابع اللي بيشك إن حد شاف باسورده مكانش قدامه أي حاجة
   يعملها. */
router.post(
  '/change-password',
  authRequired,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!isNonEmptyString(currentPassword) || !isNonEmptyString(newPassword)) {
      return res.status(400).json({ error: 'اكتب كلمة المرور الحالية والجديدة' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'كلمة المرور الجديدة لازم تكون 6 حروف على الأقل' });
    }
    if (isTooLong(newPassword, LIMITS.password)) {
      return res.status(400).json({ error: 'كلمة المرور طويلة أوي' });
    }

    const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!rows.length || !rows[0].password_hash) {
      return res.status(400).json({ error: 'الحساب ده مالوش كلمة مرور' });
    }
    if (!(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
      return res.status(401).json({ error: 'كلمة المرور الحالية غلط' });
    }

    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [
      await bcrypt.hash(newPassword, 10),
      req.user.id,
    ]);
    res.json({ ok: true });
  })
);

/* ---------- استرجاع كلمة المرور بكود الاسترجاع ----------
   بيستخدم loginLimiter: نفس الحماية من التخمين بالجملة بالظبط - الكود ده
   بديل كامل للباسورد، فلازم ياخد نفس الصرامة.

   لاحظ إن الرد واحد في كل حالات الفشل (رقم مش موجود، كود غلط، حساب مالوش كود)
   عن قصد: رسايل مختلفة كانت هتقول للمهاجم "الرقم ده مسجّل عندنا" - نفس السبب
   اللي DUMMY_HASH موجود عشانه فوق. */
router.post(
  '/recover',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { phone, recoveryCode, newPassword } = req.body || {};
    if (!isNonEmptyString(phone) || !isNonEmptyString(recoveryCode) || !isNonEmptyString(newPassword)) {
      return res.status(400).json({ error: 'اكتب رقم الموبايل وكود الاسترجاع وكلمة المرور الجديدة' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'كلمة المرور الجديدة لازم تكون 6 حروف على الأقل' });
    }
    if (isTooLong(newPassword, LIMITS.password)) {
      return res.status(400).json({ error: 'كلمة المرور طويلة أوي' });
    }

    const [rows] = await pool.query(
      'SELECT id, name, role, recovery_hash FROM users WHERE phone = ? AND role = "caregiver"',
      [phone.trim()]
    );
    const user = rows[0];
    const ok = await bcrypt.compare(
      String(recoveryCode).trim().toUpperCase(),
      user && user.recovery_hash ? user.recovery_hash : DUMMY_HASH
    );
    if (!user || !user.recovery_hash || !ok) {
      return res.status(401).json({ error: 'رقم الموبايل أو كود الاسترجاع غلط' });
    }

    /* الكود بيتستهلك ويتولّد واحد جديد: كود استرجاع بيفضل صالح للأبد بعد ما
       اتستخدم يبقى باسورد تاني دايم، والمستخدم غالبًا كاتبه في مكان أقل أمانًا
       من الباسورد نفسه. */
    const nextCode = generateRecoveryCode();
    await pool.query('UPDATE users SET password_hash = ?, recovery_hash = ? WHERE id = ?', [
      await bcrypt.hash(newPassword, 10),
      await bcrypt.hash(nextCode, 10),
      user.id,
    ]);

    const token = signToken({ id: user.id, role: user.role, name: user.name });
    res.json({ ok: true, token, recoveryCode: nextCode });
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
