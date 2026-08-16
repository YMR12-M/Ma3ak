const express = require('express');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');

const router = express.Router();

router.get(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json({ notifications: rows });
  })
);

router.post(
  '/:id/read',
  authRequired,
  asyncHandler(async (req, res) => {
    // شرط user_id مش زيادة: هو اللي بيمنع مستخدم إنه يعدّل إشعار مستخدم تاني
    await pool.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [
      req.params.id,
      req.user.id,
    ]);
    res.json({ ok: true });
  })
);

router.post(
  '/read-all',
  authRequired,
  asyncHandler(async (req, res) => {
    await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
    res.json({ ok: true });
  })
);

module.exports = router;
