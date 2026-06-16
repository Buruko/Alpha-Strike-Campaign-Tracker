import { v4 as uuid } from 'uuid';
import { getDb } from '../db/db.js';
import { verifyAuth, requireMinRole } from '../middleware/auth.js';
import { ok, err } from '../lib/response.js';
import { calcKillXP, DAMAGE_XP } from '../lib/xpCalculator.js';
import { checkAndPromote, buildRankUpNotification, getRankDef } from '../lib/rankEngine.js';

export async function awardXpToPilot(db, pilotId, amount, eventType, notes, sessionId, awardedBy) {
  const pilot = await db.get('SELECT * FROM pilots WHERE id=?', [pilotId]);
  if (!pilot) throw new Error(`Pilot ${pilotId} not found`);
  const eventId = uuid();
  const newXp   = pilot.xp_total + amount;
  await db.batch([
    { sql: 'INSERT INTO xp_events (id,pilot_id,session_id,event_type,xp_awarded,notes,awarded_by) VALUES (?,?,?,?,?,?,?)',
      params: [eventId, pilotId, sessionId ?? null, eventType, amount, notes ?? null, awardedBy] },
    { sql: 'UPDATE pilots SET xp_total=? WHERE id=?', params: [newXp, pilotId] },
  ]);
  const updated  = await db.get('SELECT * FROM pilots WHERE id=?', [pilotId]);
  const promotion = checkAndPromote(updated);
  if (promotion) {
    const { nextRankDef, ...rankFields } = promotion;
    const stmts = [{ sql: 'UPDATE pilots SET rank=?,skill=?,psa_slots_available=?,rank_up_pending=1 WHERE id=?',
      params: [rankFields.rank, rankFields.skill, rankFields.psa_slots_available, pilotId] }];
    const owner = await db.get(`SELECT u.id AS user_id FROM users u JOIN players pl ON pl.user_id=u.id WHERE pl.id=?`, [updated.player_id]);
    if (owner) {
      const promoted = await db.get('SELECT * FROM pilots WHERE id=?', [pilotId]);
      const notif = buildRankUpNotification({ ...promoted, ...rankFields }, nextRankDef, owner.user_id);
      stmts.push({ sql: 'INSERT INTO notifications (id,user_id,type,title,body,pilot_id,read) VALUES (?,?,?,?,?,?,0)',
        params: [uuid(), notif.user_id, notif.type, notif.title, notif.body, notif.pilot_id] });
    }
    await db.batch(stmts);
    return { pilot: await db.get('SELECT * FROM pilots WHERE id=?', [pilotId]), promoted: true, rankUpDef: nextRankDef };
  }
  return { pilot: updated, promoted: false, rankUpDef: null };
}

export function xpRoutes(router) {

  router.post('/api/xp/award', requireMinRole('gm'), async (request, env) => {
    const db   = getDb(env);
    const body = await request.json().catch(() => ({}));
    const { pilot_id, amount, notes, session_id } = body;
    if (!pilot_id || amount == null) return err('pilot_id and amount required', 400);
    if (amount <= 0) return err('amount must be positive', 400);
    try { return ok(await awardXpToPilot(db, pilot_id, amount, 'manual', notes, session_id, request.user.id)); }
    catch (e) { return err(e.message, 400); }
  });

  router.post('/api/xp/damage', requireMinRole('gm'), async (request, env) => {
    const db   = getDb(env);
    const { pilot_id, damage_type, session_id } = await request.json().catch(() => ({}));
    const valid = ['damage_tac','damage_critical','damage_melee'];
    if (!pilot_id || !damage_type) return err('pilot_id and damage_type required', 400);
    if (!valid.includes(damage_type)) return err(`damage_type must be one of: ${valid.join(', ')}`, 400);
    try { return ok(await awardXpToPilot(db, pilot_id, DAMAGE_XP[damage_type], damage_type, null, session_id, request.user.id)); }
    catch (e) { return err(e.message, 400); }
  });

  router.post('/api/xp/kill', requireMinRole('gm'), async (request, env) => {
    const db = getDb(env);
    const { pilot_id, enemy_unit_id, session_id } = await request.json().catch(() => ({}));
    if (!pilot_id || !enemy_unit_id) return err('pilot_id and enemy_unit_id required', 400);
    const [pilot, enemy] = await Promise.all([
      db.get('SELECT * FROM pilots WHERE id=?', [pilot_id]),
      db.get('SELECT * FROM enemy_units WHERE id=?', [enemy_unit_id]),
    ]);
    if (!pilot) return err('Pilot not found', 404);
    if (!enemy) return err('Enemy unit not found', 404);
    const { xp, baseXp, multiplier, disparity } = calcKillXP(enemy.unit_type, enemy.size, pilot.skill, enemy.pilot_skill);
    const notes = `Kill: ${enemy.name} (size ${enemy.size} ${enemy.unit_type}) | Base XP: ${baseXp} × ${multiplier} (disparity ${disparity >= 0 ? '+' : ''}${disparity})`;
    try {
      const result = await awardXpToPilot(db, pilot_id, xp, 'kill', notes, session_id, request.user.id);
      await db.run("UPDATE enemy_units SET kill_credit_pilot_id=?,status='destroyed' WHERE id=?", [pilot_id, enemy_unit_id]);
      return ok({ ...result, xp_details: { xp, baseXp, multiplier, disparity } });
    } catch (e) { return err(e.message, 400); }
  });

  router.post('/api/xp/objective', requireMinRole('gm'), async (request, env) => {
    const db = getDb(env);
    const { pilot_id, objective_id, xp_override, session_id } = await request.json().catch(() => ({}));
    if (!pilot_id || !objective_id) return err('pilot_id and objective_id required', 400);
    const obj = await db.get('SELECT * FROM session_objectives WHERE id=?', [objective_id]);
    if (!obj) return err('Objective not found', 404);
    const amount   = xp_override ?? obj.xp_reward;
    const evtType  = obj.objective_type === 'hold' ? 'objective_hold' : 'objective_action';
    await db.run("UPDATE session_objectives SET completed=1,completed_by_pilot_id=?,completed_at=datetime('now') WHERE id=?", [pilot_id, objective_id]);
    try { return ok(await awardXpToPilot(db, pilot_id, amount, evtType, `Objective: ${obj.description}`, session_id, request.user.id)); }
    catch (e) { return err(e.message, 400); }
  });

  router.get('/api/xp/pilot/:pilotId', verifyAuth, async (request, env) => {
    const db    = getDb(env);
    const pilot = await db.get('SELECT * FROM pilots WHERE id=?', [request.params.pilotId]);
    if (!pilot) return err('Pilot not found', 404);
    const { role, player_id } = request.user;
    if (role === 'player' && pilot.player_id !== player_id) return err('Access denied', 403);
    const log = await db.all(`SELECT e.*, u.username AS awarded_by_username FROM xp_events e LEFT JOIN users u ON u.id=e.awarded_by WHERE e.pilot_id=? ORDER BY e.occurred_at DESC`, [request.params.pilotId]);
    return ok(log);
  });
}
