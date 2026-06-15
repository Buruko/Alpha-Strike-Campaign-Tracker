/**
 * routes/contracts.js
 *
 * GET    /api/contracts                        — list contracts
 * POST   /api/contracts                        — GM creates contract
 * PATCH  /api/contracts/:id                    — GM updates contract
 * GET    /api/contracts/:id/sessions           — sessions for a contract
 * POST   /api/contracts/:id/sessions           — GM creates session
 * PATCH  /api/sessions/:id                     — GM updates session
 * POST   /api/sessions/:id/start               — GM starts session (sets status active)
 * POST   /api/sessions/:id/end                 — GM ends session (sets status post)
 * POST   /api/sessions/:id/complete            — GM marks session fully complete
 * GET    /api/sessions/:id/objectives          — list objectives
 * POST   /api/sessions/:id/objectives          — GM adds objective
 * PATCH  /api/sessions/objectives/:objId       — GM updates objective
 */

const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../db/db');
const { verifyAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

router.use(verifyAuth);

// ── Contracts ────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const contracts = db.prepare(`
    SELECT c.*, u.username AS created_by_username,
      (SELECT COUNT(*) FROM sessions s WHERE s.contract_id = c.id) AS session_count
    FROM contracts c
    LEFT JOIN users u ON u.id = c.created_by
    ORDER BY c.created_at DESC
  `).all();
  res.json(contracts);
});

router.post('/', requireRole('gm'), (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const id = uuid();
  db.prepare(`
    INSERT INTO contracts (id, name, description, status, created_by)
    VALUES (?, ?, ?, 'active', ?)
  `).run(id, name, description ?? null, req.user.id);

  res.status(201).json(db.prepare('SELECT * FROM contracts WHERE id = ?').get(id));
});

router.patch('/:id', requireRole('gm'), (req, res) => {
  const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
  if (!contract) return res.status(404).json({ error: 'Contract not found' });

  const { name, description, status } = req.body;
  const updates = {};
  if (name        !== undefined) updates.name        = name;
  if (description !== undefined) updates.description = description;
  if (status      !== undefined) {
    if (!['active','complete','abandoned'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    updates.status    = status;
    updates.closed_at = status !== 'active' ? new Date().toISOString() : null;
  }

  if (!Object.keys(updates).length) return res.status(400).json({ error: 'No fields to update' });
  const set = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE contracts SET ${set} WHERE id = @id`).run({ ...updates, id: contract.id });

  res.json(db.prepare('SELECT * FROM contracts WHERE id = ?').get(contract.id));
});

// ── Sessions ─────────────────────────────────────────────────────────────────
router.get('/:id/sessions', (req, res) => {
  const sessions = db.prepare(`
    SELECT s.*, u.username AS created_by_username
    FROM sessions s
    LEFT JOIN users u ON u.id = s.created_by
    WHERE s.contract_id = ?
    ORDER BY s.created_at DESC
  `).all(req.params.id);
  res.json(sessions);
});

router.post('/:id/sessions', requireRole('gm'), (req, res) => {
  const contract = db.prepare('SELECT id FROM contracts WHERE id = ?').get(req.params.id);
  if (!contract) return res.status(404).json({ error: 'Contract not found' });

  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const id = uuid();
  db.prepare(`
    INSERT INTO sessions (id, contract_id, name, status, created_by)
    VALUES (?, ?, ?, 'setup', ?)
  `).run(id, contract.id, name, req.user.id);

  res.status(201).json(db.prepare('SELECT * FROM sessions WHERE id = ?').get(id));
});

router.get('/sessions/:id', (req, res) => {
  const session = db.prepare(`
    SELECT s.*, c.name AS contract_name
    FROM sessions s JOIN contracts c ON c.id = s.contract_id
    WHERE s.id = ?
  `).get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const objectives = db.prepare('SELECT * FROM session_objectives WHERE session_id = ?').all(session.id);
  res.json({ ...session, objectives });
});

router.patch('/sessions/:id', requireRole('gm'), (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { name } = req.body;
  if (name) db.prepare('UPDATE sessions SET name = ? WHERE id = ?').run(name, session.id);
  res.json(db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id));
});

router.post('/sessions/:id/start', requireRole('gm'), (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (session.status !== 'setup') {
    return res.status(400).json({ error: `Session is already ${session.status}` });
  }
  db.prepare(`UPDATE sessions SET status = 'active', started_at = datetime('now') WHERE id = ?`).run(session.id);
  res.json(db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id));
});

router.post('/sessions/:id/end', requireRole('gm'), (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (session.status !== 'active') {
    return res.status(400).json({ error: `Session is not active` });
  }
  db.prepare(`UPDATE sessions SET status = 'post', ended_at = datetime('now') WHERE id = ?`).run(session.id);

  // Notify all users that salvage review is available
  const users = db.prepare(`SELECT id FROM users WHERE role != 'player'`).all();
  for (const u of users) {
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body)
      VALUES (?, ?, 'salvage_available', 'Session ended — Salvage review ready',
        'The session has ended. Review available salvage before marking complete.')
    `).run(uuid(), u.id);
  }

  res.json(db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id));
});

router.post('/sessions/:id/complete', requireRole('gm'), (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  db.prepare(`UPDATE sessions SET status = 'complete', salvage_done = 1, xp_done = 1 WHERE id = ?`).run(session.id);
  res.json({ ok: true });
});

// ── Objectives ───────────────────────────────────────────────────────────────
router.get('/sessions/:id/objectives', (req, res) => {
  const objectives = db.prepare('SELECT * FROM session_objectives WHERE session_id = ?').all(req.params.id);
  res.json(objectives);
});

router.post('/sessions/:id/objectives', requireRole('gm'), (req, res) => {
  const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { description, objective_type, xp_reward } = req.body;
  if (!description || !objective_type) {
    return res.status(400).json({ error: 'description and objective_type are required' });
  }

  const id = uuid();
  db.prepare(`
    INSERT INTO session_objectives (id, session_id, description, objective_type, xp_reward)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, session.id, description, objective_type, xp_reward ?? 1);

  res.status(201).json(db.prepare('SELECT * FROM session_objectives WHERE id = ?').get(id));
});

router.patch('/sessions/objectives/:objId', requireRole('gm'), (req, res) => {
  const obj = db.prepare('SELECT * FROM session_objectives WHERE id = ?').get(req.params.objId);
  if (!obj) return res.status(404).json({ error: 'Objective not found' });

  const { description, xp_reward, completed } = req.body;
  const updates = {};
  if (description !== undefined) updates.description = description;
  if (xp_reward   !== undefined) updates.xp_reward   = xp_reward;
  if (completed   !== undefined) updates.completed   = completed ? 1 : 0;

  if (!Object.keys(updates).length) return res.status(400).json({ error: 'No fields to update' });
  const set = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE session_objectives SET ${set} WHERE id = @id`).run({ ...updates, id: obj.id });

  res.json(db.prepare('SELECT * FROM session_objectives WHERE id = ?').get(obj.id));
});

module.exports = router;
