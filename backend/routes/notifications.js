const express = require('express');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.get('/', authRequired, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
    [req.user.id]
  );
  res.json({ notifications: rows });
});

router.post('/:id/read', authRequired, async (req, res) => {
  await pool.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [
    req.params.id,
    req.user.id,
  ]);
  res.json({ ok: true });
});

router.post('/read-all', authRequired, async (req, res) => {
  await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
  res.json({ ok: true });
});

module.exports = router;
