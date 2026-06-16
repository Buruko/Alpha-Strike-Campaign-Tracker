import { v4 as uuid } from 'uuid';
import { getDb } from '../db/db.js';
import { verifyAuth, requireMinRole } from '../middleware/auth.js';
import { ok, err } from '../lib/response.js';

export function contractRoutes(router) {

  router.get('/api/contracts', verifyAuth, async (request, env) => {
    const db = getDb(env);
    return ok(await db.all(`SELECT c.*,u.username AS created_by_username,(SELECT COUNT(*) FROM sessions s WHERE s.contract_id=c.id) AS session_count FROM contracts c LEFT JOIN users u ON u.id=c.created_by ORDER BY c.created_at DESC`));
  });

  router.post('/api/contracts', requireMinRole('gm'), async (request, env) => {
    const db = getDb(env);
    const { name, description } = await request.json().catch(() => ({}));
    if (!name) return err('name required', 400);
    const id = uuid();
    await db.run("INSERT INTO contracts (id,name,description,status,created_by) VALUES (?,?,?,'active',?)", [id, name, description??null, request.user.id]);
    return ok(await db.get('SELECT * FROM contracts WHERE id=?', [id]), 201);
  });

  router.patch('/api/contracts/:id', requireMinRole('gm'), async (request, env) => {
    const db = getDb(env);
    const c  = await db.get('SELECT * FROM contracts WHERE id=?', [request.params.id]);
    if (!c) return err('Contract not found', 404);
    const { name, description, status } = await request.json().catch(() => ({}));
    const updates = {};
    if (name        !== undefined) updates.name        = name;
    if (description !== undefined) updates.description = description;
    if (status      !== undefined) {
      if (!['active','complete','abandoned'].includes(status)) return err('Invalid status', 400);
      updates.status    = status;
      updates.closed_at = status !== 'active' ? new Date().toISOString() : null;
    }
    if (!Object.keys(updates).length) return err('No fields to update', 400);
    const set = Object.keys(updates).map(k => `${k}=?`).join(', ');
    await db.run(`UPDATE contracts SET ${set} WHERE id=?`, [...Object.values(updates), c.id]);
    return ok(await db.get('SELECT * FROM contracts WHERE id=?', [c.id]));
  });

  router.get('/api/contracts/:id/sessions', verifyAuth, async (request, env) => {
    const db = getDb(env);
    return ok(await db.all(`SELECT s.*,u.username AS created_by_username FROM sessions s LEFT JOIN users u ON u.id=s.created_by WHERE s.contract_id=? ORDER BY s.created_at DESC`, [request.params.id]));
  });

  router.post('/api/contracts/:id/sessions', requireMinRole('gm'), async (request, env) => {
    const db = getDb(env);
    const c  = await db.get('SELECT id FROM contracts WHERE id=?', [request.params.id]);
    if (!c) return err('Contract not found', 404);
    const { name } = await request.json().catch(() => ({}));
    if (!name) return err('name required', 400);
    const id = uuid();
    await db.run("INSERT INTO sessions (id,contract_id,name,status,created_by) VALUES (?,?,?,'setup',?)", [id, c.id, name, request.user.id]);
    return ok(await db.get('SELECT * FROM sessions WHERE id=?', [id]), 201);
  });

  router.get('/api/contracts/sessions/:id', verifyAuth, async (request, env) => {
    const db = getDb(env);
    const s  = await db.get(`SELECT s.*,c.name AS contract_name FROM sessions s JOIN contracts c ON c.id=s.contract_id WHERE s.id=?`, [request.params.id]);
    if (!s) return err('Session not found', 404);
    const objectives = await db.all('SELECT * FROM session_objectives WHERE session_id=?', [s.id]);
    return ok({ ...s, objectives });
  });

  router.patch('/api/contracts/sessions/:id', requireMinRole('gm'), async (request, env) => {
    const db = getDb(env);
    const s  = await db.get('SELECT * FROM sessions WHERE id=?', [request.params.id]);
    if (!s) return err('Session not found', 404);
    const { name } = await request.json().catch(() => ({}));
    if (name) await db.run('UPDATE sessions SET name=? WHERE id=?', [name, s.id]);
    return ok(await db.get('SELECT * FROM sessions WHERE id=?', [s.id]));
  });

  router.post('/api/contracts/sessions/:id/start', requireMinRole('gm'), async (request, env) => {
    const db = getDb(env);
    const s  = await db.get('SELECT * FROM sessions WHERE id=?', [request.params.id]);
    if (!s) return err('Session not found', 404);
    if (s.status !== 'setup') return err(`Session is already ${s.status}`, 400);
    await db.run("UPDATE sessions SET status='active',started_at=datetime('now') WHERE id=?", [s.id]);
    return ok(await db.get('SELECT * FROM sessions WHERE id=?', [s.id]));
  });

  router.post('/api/contracts/sessions/:id/end', requireMinRole('gm'), async (request, env) => {
    const db = getDb(env);
    const s  = await db.get('SELECT * FROM sessions WHERE id=?', [request.params.id]);
    if (!s) return err('Session not found', 404);
    if (s.status !== 'active') return err('Session is not active', 400);
    await db.run("UPDATE sessions SET status='post',ended_at=datetime('now') WHERE id=?", [s.id]);
    const staff = await db.all("SELECT id FROM users WHERE role!='player'");
    await db.batch(staff.map(u => ({
      sql: "INSERT INTO notifications (id,user_id,type,title,body) VALUES (?,?,'salvage_available','Session ended — Salvage review ready','Review available salvage before marking complete.')",
      params: [uuid(), u.id],
    })));
    return ok(await db.get('SELECT * FROM sessions WHERE id=?', [s.id]));
  });

  router.post('/api/contracts/sessions/:id/complete', requireMinRole('gm'), async (request, env) => {
    const db = getDb(env);
    await db.run("UPDATE sessions SET status='complete',salvage_done=1,xp_done=1 WHERE id=?", [request.params.id]);
    return ok({ ok: true });
  });

  router.get('/api/contracts/sessions/:id/objectives', verifyAuth, async (request, env) => {
    const db = getDb(env);
    return ok(await db.all('SELECT * FROM session_objectives WHERE session_id=?', [request.params.id]));
  });

  router.post('/api/contracts/sessions/:id/objectives', requireMinRole('gm'), async (request, env) => {
    const db = getDb(env);
    const s  = await db.get('SELECT id FROM sessions WHERE id=?', [request.params.id]);
    if (!s) return err('Session not found', 404);
    const { description, objective_type, xp_reward } = await request.json().catch(() => ({}));
    if (!description || !objective_type) return err('description and objective_type required', 400);
    const id = uuid();
    await db.run('INSERT INTO session_objectives (id,session_id,description,objective_type,xp_reward) VALUES (?,?,?,?,?)', [id, s.id, description, objective_type, xp_reward??1]);
    return ok(await db.get('SELECT * FROM session_objectives WHERE id=?', [id]), 201);
  });

  router.patch('/api/contracts/sessions/objectives/:objId', requireMinRole('gm'), async (request, env) => {
    const db  = getDb(env);
    const obj = await db.get('SELECT * FROM session_objectives WHERE id=?', [request.params.objId]);
    if (!obj) return err('Objective not found', 404);
    const { description, xp_reward, completed } = await request.json().catch(() => ({}));
    const updates = {};
    if (description !== undefined) updates.description = description;
    if (xp_reward   !== undefined) updates.xp_reward   = xp_reward;
    if (completed   !== undefined) updates.completed   = completed ? 1 : 0;
    if (!Object.keys(updates).length) return err('No fields to update', 400);
    const set = Object.keys(updates).map(k => `${k}=?`).join(', ');
    await db.run(`UPDATE session_objectives SET ${set} WHERE id=?`, [...Object.values(updates), obj.id]);
    return ok(await db.get('SELECT * FROM session_objectives WHERE id=?', [obj.id]));
  });
}
