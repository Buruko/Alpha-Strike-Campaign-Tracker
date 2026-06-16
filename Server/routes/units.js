import { v4 as uuid } from 'uuid';
import { getDb } from '../db/db.js';
import { verifyAuth, requireMinRole } from '../middleware/auth.js';
import { ok, err } from '../lib/response.js';
import { calcRepairCost, calcSaleValue, calcCostPerPip } from '../lib/repairCalculator.js';

function tryParse(v, fb) { try { return v ? JSON.parse(v) : fb; } catch { return fb; } }

function enrich(unit) {
  return { ...unit,
    repair_cost_current: calcRepairCost(unit),
    cost_per_pip:        calcCostPerPip(unit.base_pv, unit.armor_max),
    abilities: tryParse(unit.abilities, []),
    move_data: tryParse(unit.move_data, []),
  };
}

async function postLedger(db, { type, amount, description, unitId, sessionId, repairJobId, salvageId, createdBy }) {
  const acct = await db.get('SELECT balance FROM campaign_account WHERE id=1');
  const cur  = acct?.balance ?? 0;
  const isDebit = type.startsWith('withdraw');
  const newBal  = isDebit ? cur - amount : cur + amount;
  await db.batch([
    { sql: 'UPDATE campaign_account SET balance=? WHERE id=1', params: [newBal] },
    { sql: 'INSERT INTO account_ledger (id,type,amount,balance_after,description,unit_id,session_id,repair_job_id,salvage_id,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)',
      params: [uuid(), type, amount, newBal, description, unitId??null, sessionId??null, repairJobId??null, salvageId??null, createdBy] },
  ]);
  return newBal;
}

export function unitRoutes(router) {

  router.get('/api/units', verifyAuth, async (request, env) => {
    const db = getDb(env);
    const { role, player_id } = request.user;
    const units = role === 'player'
      ? await db.all(`SELECT u.*,pl.callsign AS player_callsign FROM units u JOIN players pl ON pl.id=u.player_id WHERE u.player_id=? AND u.status!='retired' ORDER BY u.name`, [player_id])
      : await db.all(`SELECT u.*,pl.callsign AS player_callsign FROM units u JOIN players pl ON pl.id=u.player_id WHERE u.status!='retired' ORDER BY pl.callsign,u.name`);
    const withPilots = await Promise.all(units.map(async unit => {
      const pilot = await db.get(`SELECT p.id,p.name,p.skill,p.rank FROM pilot_unit_assignments pua JOIN pilots p ON p.id=pua.pilot_id WHERE pua.unit_id=? AND pua.unassigned_at IS NULL LIMIT 1`, [unit.id]);
      return { ...enrich(unit), current_pilot: pilot ?? null };
    }));
    return ok(withPilots);
  });

  router.get('/api/units/:id', verifyAuth, async (request, env) => {
    const db   = getDb(env);
    const unit = await db.get(`SELECT u.*,pl.callsign AS player_callsign FROM units u JOIN players pl ON pl.id=u.player_id WHERE u.id=?`, [request.params.id]);
    if (!unit) return err('Unit not found', 404);
    const { role, player_id } = request.user;
    if (role === 'player' && unit.player_id !== player_id) return err('Access denied', 403);
    const [pilot, repairHistory] = await Promise.all([
      db.get(`SELECT p.* FROM pilot_unit_assignments pua JOIN pilots p ON p.id=pua.pilot_id WHERE pua.unit_id=? AND pua.unassigned_at IS NULL LIMIT 1`, [unit.id]),
      db.all(`SELECT rj.*,u.username AS tech_username FROM repair_jobs rj LEFT JOIN users u ON u.id=rj.technician_user_id WHERE rj.unit_id=? ORDER BY rj.created_at DESC LIMIT 20`, [unit.id]),
    ]);
    return ok({ ...enrich(unit), current_pilot: pilot ?? null, repair_history: repairHistory });
  });

  router.post('/api/units', requireMinRole('quartermaster'), async (request, env) => {
    const db   = getDb(env);
    const body = await request.json().catch(() => ({}));
    const { player_id, name, variant, unit_type, size, tonnage, role, tmm, base_pv,
      armor_max, structure_max, engine_hits_max, fcu_hits_max, mp_hits_max, weapon_hits_max,
      abilities, move_data, image_url, jump_move, jeff_uuid } = body;
    if (!player_id || !name || !unit_type || !base_pv || !armor_max || !structure_max)
      return err('Required: player_id, name, unit_type, base_pv, armor_max, structure_max', 400);
    const player = await db.get('SELECT id FROM players WHERE id=?', [player_id]);
    if (!player) return err('Player not found', 404);
    const id = uuid();
    await db.run(`INSERT INTO units (id,player_id,name,variant,unit_type,size,tonnage,role,tmm,base_pv,armor_max,structure_max,engine_hits_max,fcu_hits_max,mp_hits_max,weapon_hits_max,abilities,move_data,image_url,jump_move,jeff_uuid,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active')`,
      [id,player_id,name,variant??null,unit_type,size??1,tonnage??null,role??null,tmm??0,base_pv,armor_max,structure_max,engine_hits_max??2,fcu_hits_max??4,mp_hits_max??4,weapon_hits_max??4,
       abilities?JSON.stringify(abilities):null, move_data?JSON.stringify(move_data):null, image_url??null, jump_move??0, jeff_uuid??null]);
    await postLedger(db, { type:'withdraw_purchase', amount: base_pv, description:`Purchased unit: ${name}`, unitId:id, createdBy:request.user.id });
    return ok(enrich(await db.get('SELECT * FROM units WHERE id=?', [id])), 201);
  });

  router.patch('/api/units/:id', requireMinRole('quartermaster'), async (request, env) => {
    const db   = getDb(env);
    const unit = await db.get('SELECT * FROM units WHERE id=?', [request.params.id]);
    if (!unit) return err('Unit not found', 404);
    const body    = await request.json().catch(() => ({}));
    const allowed = ['name','variant','unit_type','size','tonnage','role','tmm','base_pv','armor_max','structure_max','engine_hits_max','fcu_hits_max','mp_hits_max','weapon_hits_max','image_url','jump_move','status'];
    const updates = Object.fromEntries(allowed.filter(k => body[k] !== undefined).map(k => [k, body[k]]));
    if (!Object.keys(updates).length) return err('No valid fields', 400);
    const set = Object.keys(updates).map(k => `${k}=?`).join(', ');
    await db.run(`UPDATE units SET ${set} WHERE id=?`, [...Object.values(updates), unit.id]);
    return ok(enrich(await db.get('SELECT * FROM units WHERE id=?', [unit.id])));
  });

  router.patch('/api/units/:id/damage', verifyAuth, async (request, env) => {
    const db   = getDb(env);
    const unit = await db.get('SELECT * FROM units WHERE id=?', [request.params.id]);
    if (!unit) return err('Unit not found', 404);
    const { role, player_id } = request.user;
    if (role === 'player' && unit.player_id !== player_id) return err('Access denied', 403);
    const body   = await request.json().catch(() => ({}));
    const fields = ['armor_dmg','structure_dmg','engine_dmg','fcu_dmg','mp_dmg','weapon_dmg'];
    const maxMap = { armor_dmg:unit.armor_max, structure_dmg:unit.structure_max, engine_dmg:unit.engine_hits_max, fcu_dmg:unit.fcu_hits_max, mp_dmg:unit.mp_hits_max, weapon_dmg:unit.weapon_hits_max };
    const updates = {};
    for (const f of fields) {
      if (body[f] !== undefined) {
        const val = parseInt(body[f]);
        if (isNaN(val) || val < 0 || val > maxMap[f]) return err(`${f} out of range (0–${maxMap[f]})`, 400);
        updates[f] = val;
      }
    }
    if (!Object.keys(updates).length) return err('No damage fields provided', 400);
    const set = Object.keys(updates).map(k => `${k}=?`).join(', ');
    await db.run(`UPDATE units SET ${set} WHERE id=?`, [...Object.values(updates), unit.id]);
    return ok(enrich(await db.get('SELECT * FROM units WHERE id=?', [unit.id])));
  });

  router.post('/api/units/:id/assign-pilot', requireMinRole('quartermaster'), async (request, env) => {
    const db   = getDb(env);
    const unit = await db.get('SELECT * FROM units WHERE id=?', [request.params.id]);
    if (!unit) return err('Unit not found', 404);
    const { pilot_id } = await request.json().catch(() => ({}));
    if (!pilot_id) return err('pilot_id required', 400);
    const pilot = await db.get('SELECT * FROM pilots WHERE id=?', [pilot_id]);
    if (!pilot) return err('Pilot not found', 404);
    await db.batch([
      { sql: "UPDATE pilot_unit_assignments SET unassigned_at=datetime('now') WHERE unit_id=? AND unassigned_at IS NULL", params: [unit.id] },
      { sql: "UPDATE pilot_unit_assignments SET unassigned_at=datetime('now') WHERE pilot_id=? AND unassigned_at IS NULL", params: [pilot_id] },
      { sql: 'INSERT INTO pilot_unit_assignments (id,pilot_id,unit_id) VALUES (?,?,?)', params: [uuid(), pilot_id, unit.id] },
    ]);
    return ok({ ok: true, pilot_id, unit_id: unit.id });
  });

  router.post('/api/units/:id/unassign-pilot', requireMinRole('quartermaster'), async (request, env) => {
    const db = getDb(env);
    await db.run("UPDATE pilot_unit_assignments SET unassigned_at=datetime('now') WHERE unit_id=? AND unassigned_at IS NULL", [request.params.id]);
    return ok({ ok: true });
  });

  router.get('/api/units/:id/sale-value', verifyAuth, async (request, env) => {
    const db   = getDb(env);
    const unit = await db.get('SELECT * FROM units WHERE id=?', [request.params.id]);
    if (!unit) return err('Unit not found', 404);
    return ok(calcSaleValue(unit));
  });

  router.delete('/api/units/:id', requireMinRole('gm'), async (request, env) => {
    const db   = getDb(env);
    const unit = await db.get('SELECT id FROM units WHERE id=?', [request.params.id]);
    if (!unit) return err('Unit not found', 404);
    await db.run("UPDATE units SET status='retired' WHERE id=?", [request.params.id]);
    return ok({ ok: true });
  });
}

export { postLedger };
