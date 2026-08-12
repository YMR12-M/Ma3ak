const jwt = require('jsonwebtoken');

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'يجب تسجيل الدخول' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, role, name }
    next();
  } catch (e) {
    return res.status(401).json({ error: 'جلسة غير صالحة، سجل الدخول تاني' });
  }
}

module.exports = { authRequired };
