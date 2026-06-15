/**
 * routes/notifications.js
 *
 * GET   /api/notifications          — unread + recent for current user
 * PATCH /api/notifications/:id/read — mark one read
 * POST  /api/notifications/read-all — mark all read
 */

const router = require('express').Router();
const db = require('../db/db');
const { verifyAuth } = require('../middleware/auth');

router.use(verifyAuth);

router.get('/', (req, res) => {
  const notifs = db.prepare(`
    SELECT * FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(req.user.id);
  res.json(notifs);
});

router.patch('/:id/read', (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  res.json({ ok: true });
});

router.post('/read-all', (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

module.exports = router;
