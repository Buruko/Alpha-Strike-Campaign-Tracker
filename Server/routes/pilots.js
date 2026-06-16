import { v4 as uuid } from 'uuid';
import { getDb } from '../db/db.js';
import { verifyAuth, requireMinRole } from '../middleware/auth.js';
import { ok, err } from '../lib/response.js';
import { getRankDef, getNextRankDef, checkRankEligibility } from '../lib/rankEngine.js';

function canAccess(user, pilot) {
  if (!pilot) return 'not_found';
  if (user.role === 'gm' || user.role === 'quartermaster') return 'ok';
  if (user.role === 'player' && pilot.player_id === user.player_id) return 'ok';
  return 'forbidden';
}

export function pilotRoutes(router) {

  router.get('/api/pilots', verifyAuth, async (request, env) => {
    const db = getDb(env);
    const { role, player_id } = request.user;
    const pilots = role === 'player'
      ? await db.all(`SELECT p.*, pl.callsign AS player_callsign FROM pilots p JOIN players pl ON pl.id=p.player_id WHERE p.player_id=? ORDER BY p.name`, [player_id])
      : await db.all(`SELECT p.*, pl.callsign AS player_callsign FROM pilots p JOIN players pl ON pl.id=p.player_id ORDER BY pl.callsign,p.name`);
    const withUnits = await Promise.all(pilots.map(async p => {
      const unit = await db.get(`SELECT u.id,u.name,u.variant,u.unit_type,u.size,u.base_pv,u.status FROM pilot_unit_assignments pua JOIN units u ON u.id=pua.unit_id WHERE pua.pilot_id=? AND pua.unassigned_at IS NULL LIMIT 1`, [p.id]);
      return { ...p, current_unit: unit ?? null };
    }));
    return ok(withUnits);
  });

  router.get('/api/pilots/:id', verifyAuth, async (request, env) => {
    const db = getDb(env);
    const pilot = await db.get(`SELECT p.*, pl.callsign AS player_callsign, u.username AS player_username FROM pilots p JOIN players pl ON pl.id=p.player_id JOIN users u ON u.id=pl.user_id WHERE p.id=?`, [request.params.id]);
    const access = canAccess(request.user, pilot);
    if (access === 'not_found') return err('Pilot not found', 404);
    if (access === 'forbidden')  return err('Access denied', 403);
    const [psas, xpLog, currentUnit] = await Promise.all([
      db.all(`SELECT pp.*, pd.name, pd.description, pd.min_rank FROM pilot_psas pp JOIN psa_definitions pd ON pd.id=pp.psa_def_id WHERE pp.pilot_id=? ORDER BY pp.slot_index`, [pilot.id]),
      db.all(`SELECT * FROM xp_events WHERE pilot_id=? ORDER BY occurred_at DESC LIMIT 50`, [pilot.id]),
      db.get(`SELECT u.*, pua.assigned_at FROM pilot_unit_assignments pua JOIN units u ON u.id=pua.unit_id WHERE pua.pilot_id=? AND pua.unassigned_at IS NULL LIMIT 1`, [pilot.id]),
    ]);
    return ok({ ...pilot, psas, xp_log: xpLog, current_unit: currentUnit ?? null,
      rank_def: getRankDef(pilot.rank), next_rank_def: getNextRankDef(pilot.rank),
      rank_eligibility: checkRankEligibility(pilot) });
  });

  router.post('/api/pilots', verifyAuth, async (request, env) => {
    const db = getDb(env);
    const body = await request.json().catch(() => ({}));
    let { name, player_id, skill } = body;
    if (!name) return err('name is required', 400);
    if (request.user.role === 'player') player_id = request.user.player_id;
    else if (!player_id) return err('player_id is required', 400);
    const player = await db.get('SELECT id FROM players WHERE id=?', [player_id]);
    if (!player) return err('Player not found', 404);
    const id = uuid();
    await db.run('INSERT INTO pilots (id,player_id,name,skill,rank,xp_total,psa_slots_available,psa_slots_used) VALUES (?,?,?,?,0,0,0,0)', [id, player_id, name.trim(), skill ?? 4]);
    return ok(await db.get('SELECT * FROM pilots WHERE id=?', [id]), 201);
  });

  router.patch('/api/pilots/:id', verifyAuth, async (request, env) => {
    const db = getDb(env);
    const pilot = await db.get('SELECT * FROM pilots WHERE id=?', [request.params.id]);
    const access = canAccess(request.user, pilot);
    if (access === 'not_found') return err('Pilot not found', 404);
    if (access === 'forbidden')  return err('Access denied', 403);
    const body = await request.json().catch(() => ({}));
    const allowed = request.user.role === 'gm'
      ? ['name','skill','rank','xp_total','psa_slots_available','psa_slots_used']
      : ['name'];
    const updates = Object.fromEntries(allowed.filter(k => body[k] !== undefined).map(k => [k, body[k]]));
    if (!Object.keys(updates).length) return err('No valid fields', 400);
    const set = Object.keys(updates).map(k => `${k}=?`).join(', ');
    await db.run(`UPDATE pilots SET ${set} WHERE id=?`, [...Object.values(updates), pilot.id]);
    return ok(await db.get('SELECT * FROM pilots WHERE id=?', [pilot.id]));
  });

  router.delete('/api/pilots/:id', requireMinRole('gm'), async (request, env) => {
    const db = getDb(env);
    const pilot = await db.get('SELECT id FROM pilots WHERE id=?', [request.params.id]);
    if (!pilot) return err('Pilot not found', 404);
    await db.run('DELETE FROM pilots WHERE id=?', [request.params.id]);
    return ok({ ok: true });
  });

  router.get('/api/pilots/:id/available-psas', verifyAuth, async (request, env) => {
    const db = getDb(env);
    const pilot = await db.get('SELECT * FROM pilots WHERE id=?', [request.params.id]);
    const access = canAccess(request.user, pilot);
    if (access === 'not_found') return err('Pilot not found', 404);
    if (access === 'forbidden')  return err('Access denied', 403);
    const taken = (await db.all('SELECT psa_def_id FROM pilot_psas WHERE pilot_id=?', [pilot.id])).map(r => r.psa_def_id);
    const all   = await db.all('SELECT * FROM psa_definitions WHERE min_rank<=? ORDER BY min_rank,name', [pilot.rank]);
    return ok(all.filter(p => !taken.includes(p.id)));
  });

  router.post('/api/pilots/:id/psa', verifyAuth, async (request, env) => {
    const db = getDb(env);
    const pilot = await db.get('SELECT * FROM pilots WHERE id=?', [request.params.id]);
    const access = canAccess(request.user, pilot);
    if (access === 'not_found') return err('Pilot not found', 404);
    if (access === 'forbidden')  return err('Access denied', 403);
    const { psa_def_id } = await request.json().catch(() => ({}));
    if (!psa_def_id) return err('psa_def_id required', 400);
    const psaDef = await db.get('SELECT * FROM psa_definitions WHERE id=?', [psa_def_id]);
    if (!psaDef) return err('PSA not found', 404);
    if (psaDef.min_rank > pilot.rank) return err(`Requires rank ${psaDef.min_rank}`, 400);
    if (pilot.psa_slots_used >= pilot.psa_slots_available) return err('No PSA slots available', 400);
    const already = await db.get('SELECT id FROM pilot_psas WHERE pilot_id=? AND psa_def_id=?', [pilot.id, psa_def_id]);
    if (already) return err('PSA already selected', 409);
    await db.batch([
      { sql: 'INSERT INTO pilot_psas (id,pilot_id,psa_def_id,slot_index) VALUES (?,?,?,?)', params: [uuid(), pilot.id, psa_def_id, pilot.psa_slots_used + 1] },
      { sql: 'UPDATE pilots SET psa_slots_used=psa_slots_used+1 WHERE id=?', params: [pilot.id] },
    ]);
    return ok(await db.get('SELECT * FROM pilots WHERE id=?', [pilot.id]), 201);
  });

  router.get('/api/pilots/:id/rank-status', verifyAuth, async (request, env) => {
    const db = getDb(env);
    const pilot = await db.get('SELECT * FROM pilots WHERE id=?', [request.params.id]);
    const access = canAccess(request.user, pilot);
    if (access === 'not_found') return err('Pilot not found', 404);
    if (access === 'forbidden')  return err('Access denied', 403);
    return ok({ current_rank: getRankDef(pilot.rank), next_rank: getNextRankDef(pilot.rank),
      eligibility: checkRankEligibility(pilot), psa_slots_available: pilot.psa_slots_available,
      psa_slots_used: pilot.psa_slots_used, xp_total: pilot.xp_total });
  });

  router.post('/api/pilots/:id/dismiss-rankup', verifyAuth, async (request, env) => {
    const db = getDb(env);
    const pilot = await db.get('SELECT * FROM pilots WHERE id=?', [request.params.id]);
    const access = canAccess(request.user, pilot);
    if (access === 'not_found') return err('Pilot not found', 404);
    if (access === 'forbidden')  return err('Access denied', 403);
    await db.batch([
      { sql: 'UPDATE pilots SET rank_up_pending=0 WHERE id=?', params: [pilot.id] },
      { sql: "UPDATE notifications SET read=1 WHERE pilot_id=? AND type='rank_up' AND read=0", params: [pilot.id] },
    ]);
    return ok({ ok: true });
  });
}
