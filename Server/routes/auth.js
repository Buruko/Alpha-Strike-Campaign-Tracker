/**
 * routes/auth.js
 * POST /api/auth/login
 * POST /api/auth/logout
 * POST /api/auth/register   (GM only)
 * GET  /api/auth/me
 */

const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const db      = require('../db/db');
const { verifyAuth, JWT_SECRET } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const COOKIE_OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
};

// ── Login ────────────────────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  // Attach player_id if this user has a player record
  const player = db.prepare('SELECT id FROM players WHERE user_id = ?').get(user.id);

  const payload = {
    id:        user.id,
    username:  user.username,
    role:      user.role,
    player_id: player?.id ?? null,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, COOKIE_OPTS);
  res.json({ user: payload });
});

// ── Logout ───────────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

// ── Me ───────────────────────────────────────────────────────────────────────
router.get('/me', verifyAuth, (req, res) => {
  const user = db.prepare(
    'SELECT id, username, role, created_at FROM users WHERE id = ?'
  ).get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const player = db.prepare('SELECT * FROM players WHERE user_id = ?').get(user.id);
  res.json({ user, player: player ?? null });
});

// ── Register (GM only) ───────────────────────────────────────────────────────
router.post('/register', verifyAuth, requireRole('gm'), (req, res) => {
  const { username, password, role, callsign } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ error: 'username, password, and role are required' });
  }
  const validRoles = ['player', 'technician', 'quartermaster', 'gm'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'Username already taken' });

  const hash   = bcrypt.hashSync(password, 10);
  const userId = uuid();

  const createUser = db.transaction(() => {
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)
    `).run(userId, username, hash, role);

    // Auto-create player record for player role
    if (role === 'player') {
      const playerId = uuid();
      db.prepare(`
        INSERT INTO players (id, user_id, callsign) VALUES (?, ?, ?)
      `).run(playerId, userId, callsign || username);
      return { userId, playerId };
    }
    return { userId, playerId: null };
  });

  const result = createUser();
  res.status(201).json({
    message: 'User created',
    userId:  result.userId,
    playerId: result.playerId,
  });
});

// ── Change password ──────────────────────────────────────────────────────────
router.post('/change-password', verifyAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(bcrypt.hashSync(newPassword, 10), req.user.id);

  res.json({ ok: true });
});

module.exports = router;
