import { v4 as uuid } from 'uuid';
import { getDb } from '../db/db.js';
import { requireMinRole } from '../middleware/auth.js';
import { ok, err } from '../lib/response.js';
import { calcRepairCost, calcSalvageValue } from '../lib/repairCalculator.js';
import { postLedgerEntry } from './accounting.js';

function tryParse(v, fb) { try { return v ? JSON.parse(v) : fb; } catch { return fb; } }

export function salvageRoutes(router) {

  router.post('/api/salvage/build/:sessionId', requireMinRole('quartermaster'), async (request, env) => {
    const db      = getDb(env);
    const session = await db.get('SELECT * FROM sessions WHERE id=?', [request.params.sessionId]);
    if (!session) return err('Session not found', 404);
    if (session.status !== 'post' && session.status !== 'complete')
      return err('Session must be post or complete to build salvage', 400);
    const enemies = await db.all("SELECT * FROM enemy_units WHERE session_id=? AND status!='withdrawn'", [request.params.sessionId]);
    if (!enemies.length) return ok({ built: 0, message: 'No eligible units for salvage' });
    let built = 0;
    const stmts = [];
    for (const enemy of enemies) {
      const existing = await db.get('SELECT id FROM salvage_queue WHERE enemy_unit_id=?', [enemy.id]);
      if (existing) continue;
      stmts.push({ sql: 'INSERT INTO salvage_queue (id,session_id,enemy_unit_id,repair_cost,salvage_value,status,kill_credit_pilot_id) VALUES (?,?,?,?,?,?,?)',
        params: [uuid(), request.params.sessionId, enemy.id, calcRepairCost(enemy), calcSalvageValue(enemy), 'pending', enemy.kill_credit_pilot_id ?? null] });
      built++;
    }
    if (stmts.length) await db.batch(stmts);
    return ok({ built, total_eligible: enemies.length });
  });

  router.get('/api/salvage/:sessionId', requireMinRole('quartermaster'), async (request, env) => {
    const db    = getDb(env);
    const items = await db.all(`
      SELECT sq.*,
        eu.name AS unit_name,eu.variant,eu.unit_type,eu.size,eu.base_pv,
        eu.armor_max,eu.structure_max,eu.armor_dmg,eu.structure_dmg,
        eu.engine_dmg,eu.fcu_dmg,eu.mp_dmg,eu.weapon_dmg,
        eu.image_url,eu.status AS unit_status,eu.group_name,
        eu.abilities,eu.move_data,eu.tonnage,eu.role,
        kp.name AS kill_pilot_name,
        pl.callsign AS claimed_by_callsign
      FROM salvage_queue sq
      JOIN enemy_units eu ON eu.id=sq.enemy_unit_id
      LEFT JOIN pilots kp ON kp.id=sq.kill_credit_pilot_id
      LEFT JOIN players pl ON pl.id=sq.claimed_by_player_id
      WHERE sq.session_id=?
      ORDER BY eu.base_pv DESC`, [request.params.sessionId]);
    return ok(items.map(i => ({ ...i, abilities: tryParse(i.abilities, []), move_data: tryParse(i.move_data, []) })));
  });

  router.post('/api/salvage/:id/claim', requireMinRole('quartermaster'), async (request, env) => {
    const db  = getDb(env);
    const sq  = await db.get('SELECT * FROM salvage_queue WHERE id=?', [request.params.id]);
    if (!sq) return err('Salvage item not found', 404);
    if (sq.status !== 'pending') return err(`Already ${sq.status}`, 400);
    const { player_id } = await request.json().catch(() => ({}));
    if (!player_id) return err('player_id required', 400);
    const [player, enemy] = await Promise.all([
      db.get('SELECT * FROM players WHERE id=?', [player_id]),
      db.get('SELECT * FROM enemy_units WHERE id=?', [sq.enemy_unit_id]),
    ]);
    if (!player) return err('Player not found', 404);
    if (!enemy)  return err('Enemy unit not found', 404);
    const newUnitId = uuid();
    await db.batch([
      { sql: `INSERT INTO units (id,player_id,name,variant,unit_type,size,tonnage,role,tmm,base_pv,armor_max,structure_max,engine_hits_max,fcu_hits_max,mp_hits_max,weapon_hits_max,armor_dmg,structure_dmg,engine_dmg,fcu_dmg,mp_dmg,weapon_dmg,abilities,move_data,image_url,status,jeff_uuid) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?)`,
        params: [newUnitId,player_id,enemy.name,enemy.variant??null,enemy.unit_type,enemy.size,enemy.tonnage??null,enemy.role??null,enemy.tmm??0,enemy.base_pv,enemy.armor_max,enemy.structure_max,enemy.engine_hits_max,enemy.fcu_hits_max,enemy.mp_hits_max,enemy.weapon_hits_max,enemy.armor_dmg,enemy.structure_dmg,enemy.engine_dmg,enemy.fcu_dmg,enemy.mp_dmg,enemy.weapon_dmg,enemy.abilities,enemy.move_data,enemy.image_url??null,enemy.jeff_uuid??null] },
      { sql: "UPDATE salvage_queue SET status='claimed',claimed_by_player_id=?,claimed_at=datetime('now') WHERE id=?",
        params: [player_id, sq.id] },
    ]);
    await postLedgerEntry(db, { type:'deposit_salvage_value', amount:sq.salvage_value,
      description:`Salvage claimed: ${enemy.name} → ${player.callsign}`,
      unitId:newUnitId, salvageId:sq.id, createdBy:request.user.id });
    const owner = await db.get('SELECT user_id FROM players WHERE id=?', [player_id]);
    if (owner) await db.run('INSERT INTO notifications (id,user_id,type,title,body) VALUES (?,?,?,?,?)',
      [uuid(), owner.user_id, 'general', 'Salvaged unit added to your roster',
       `${enemy.name} added. Repair cost: ${sq.repair_cost} pts.`]);
    const acct = await db.get('SELECT balance FROM campaign_account WHERE id=1');
    return ok({ ok:true, new_unit_id:newUnitId, salvage_value:sq.salvage_value, repair_cost:sq.repair_cost, balance:acct?.balance??0 });
  });

  router.post('/api/salvage/:id/dismiss', requireMinRole('quartermaster'), async (request, env) => {
    const db = getDb(env);
    const sq = await db.get('SELECT id,status FROM salvage_queue WHERE id=?', [request.params.id]);
    if (!sq) return err('Salvage item not found', 404);
    if (sq.status !== 'pending') return err(`Already ${sq.status}`, 400);
    await db.run("UPDATE salvage_queue SET status='dismissed' WHERE id=?", [sq.id]);
    return ok({ ok: true });
  });
}
