import { v4 as uuid } from 'uuid';
import { getDb } from '../db/db.js';
import { verifyAuth, requireMinRole } from '../middleware/auth.js';
import { ok, err } from '../lib/response.js';
import { calcCostPerPip } from '../lib/repairCalculator.js';
import { postLedger } from './units.js';

export function repairRoutes(router) {

  router.get('/api/repairs', verifyAuth, async (request, env) => {
    const db = getDb(env);
    const { role, player_id } = request.user;
    const jobs = role === 'player'
      ? await db.all(`SELECT rj.*,u.name AS unit_name,pl.callsign AS player_callsign FROM repair_jobs rj JOIN units u ON u.id=rj.unit_id JOIN players pl ON pl.id=u.player_id WHERE pl.id=? ORDER BY rj.created_at DESC`, [player_id])
      : await db.all(`SELECT rj.*,u.name AS unit_name,pl.callsign AS player_callsign,tech.username AS tech_username FROM repair_jobs rj JOIN units u ON u.id=rj.unit_id JOIN players pl ON pl.id=u.player_id LEFT JOIN users tech ON tech.id=rj.technician_user_id ORDER BY rj.created_at DESC`);
    return ok(jobs);
  });

  router.get('/api/repairs/:id', verifyAuth, async (request, env) => {
    const db  = getDb(env);
    const job = await db.get(`SELECT rj.*,u.name AS unit_name,u.base_pv,u.armor_max,pl.callsign AS player_callsign,pl.id AS player_id,tech.username AS tech_username FROM repair_jobs rj JOIN units u ON u.id=rj.unit_id JOIN players pl ON pl.id=u.player_id LEFT JOIN users tech ON tech.id=rj.technician_user_id WHERE rj.id=?`, [request.params.id]);
    if (!job) return err('Repair job not found', 404);
    const { role, player_id } = request.user;
    if (role === 'player' && job.player_id !== player_id) return err('Access denied', 403);
    return ok(job);
  });

  router.post('/api/repairs', requireMinRole('technician'), async (request, env) => {
    const db   = getDb(env);
    const body = await request.json().catch(() => ({}));
    const { unit_id, armor_restored, structure_restored, engine_restored, fcu_restored, mp_restored, weapon_restored, notes } = body;
    if (!unit_id) return err('unit_id required', 400);
    const unit = await db.get('SELECT * FROM units WHERE id=?', [unit_id]);
    if (!unit) return err('Unit not found', 404);
    const r = { armor: parseInt(armor_restored??0), structure: parseInt(structure_restored??0), engine: parseInt(engine_restored??0), fcu: parseInt(fcu_restored??0), mp: parseInt(mp_restored??0), weapon: parseInt(weapon_restored??0) };
    const errs = [];
    if (r.armor     > unit.armor_dmg)     errs.push(`armor_restored (${r.armor}) exceeds damage`);
    if (r.structure > unit.structure_dmg) errs.push(`structure_restored (${r.structure}) exceeds damage`);
    if (r.engine    > unit.engine_dmg)    errs.push(`engine_restored (${r.engine}) exceeds damage`);
    if (r.fcu       > unit.fcu_dmg)       errs.push(`fcu_restored (${r.fcu}) exceeds damage`);
    if (r.mp        > unit.mp_dmg)        errs.push(`mp_restored (${r.mp}) exceeds damage`);
    if (r.weapon    > unit.weapon_dmg)    errs.push(`weapon_restored (${r.weapon}) exceeds damage`);
    if (errs.length) return err(errs.join('; '), 400);
    const cpp  = calcCostPerPip(unit.base_pv, unit.armor_max);
    const cost = (r.armor*cpp.armor)+(r.structure*cpp.structure)+(r.engine*cpp.engine)+(r.fcu*cpp.fcu)+(r.mp*cpp.mp)+(r.weapon*cpp.weapon);
    const id   = uuid();
    await db.run(`INSERT INTO repair_jobs (id,unit_id,technician_user_id,armor_restored,structure_restored,engine_restored,fcu_restored,mp_restored,weapon_restored,repair_cost,notes,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending')`,
      [id,unit_id,request.user.id,r.armor,r.structure,r.engine,r.fcu,r.mp,r.weapon,cost,notes??null]);
    return ok(await db.get('SELECT * FROM repair_jobs WHERE id=?', [id]), 201);
  });

  router.patch('/api/repairs/:id/approve', requireMinRole('quartermaster'), async (request, env) => {
    const db  = getDb(env);
    const job = await db.get('SELECT * FROM repair_jobs WHERE id=?', [request.params.id]);
    if (!job) return err('Repair job not found', 404);
    if (job.status !== 'pending') return err(`Cannot approve status: ${job.status}`, 400);
    const acct = await db.get('SELECT balance FROM campaign_account WHERE id=1');
    if ((acct?.balance ?? 0) < job.repair_cost) return err(`Insufficient funds. Balance: ${acct?.balance ?? 0}, Cost: ${job.repair_cost}`, 400);
    await db.run('UPDATE repair_jobs SET status=?,approved_by=? WHERE id=?', ['approved', request.user.id, job.id]);
    return ok(await db.get('SELECT * FROM repair_jobs WHERE id=?', [job.id]));
  });

  router.patch('/api/repairs/:id/complete', requireMinRole('technician'), async (request, env) => {
    const db  = getDb(env);
    const job = await db.get('SELECT * FROM repair_jobs WHERE id=?', [request.params.id]);
    if (!job) return err('Repair job not found', 404);
    if (job.status !== 'approved') return err(`Job must be approved first. Status: ${job.status}`, 400);
    const unit = await db.get('SELECT * FROM units WHERE id=?', [job.unit_id]);
    if (!unit) return err('Unit not found', 404);
    await db.batch([
      { sql: `UPDATE units SET armor_dmg=MAX(0,armor_dmg-?),structure_dmg=MAX(0,structure_dmg-?),engine_dmg=MAX(0,engine_dmg-?),fcu_dmg=MAX(0,fcu_dmg-?),mp_dmg=MAX(0,mp_dmg-?),weapon_dmg=MAX(0,weapon_dmg-?) WHERE id=?`,
        params: [job.armor_restored,job.structure_restored,job.engine_restored,job.fcu_restored,job.mp_restored,job.weapon_restored,unit.id] },
      { sql: "UPDATE repair_jobs SET status='complete',completed_at=datetime('now') WHERE id=?", params: [job.id] },
    ]);
    await postLedger(db, { type:'withdraw_repair', amount:job.repair_cost, description:`Repair: ${unit.name}`, unitId:unit.id, repairJobId:job.id, createdBy:request.user.id });
    const owner = await db.get(`SELECT u.id FROM users u JOIN players pl ON pl.user_id=u.id WHERE pl.id=?`, [unit.player_id]);
    if (owner) await db.run('INSERT INTO notifications (id,user_id,type,title,body) VALUES (?,?,?,?,?)',
      [uuid(), owner.id, 'repair_complete', `${unit.name} repairs complete`, `Cost: ${job.repair_cost} pts deducted.`]);
    return ok(await db.get('SELECT * FROM repair_jobs WHERE id=?', [job.id]));
  });

  router.patch('/api/repairs/:id/cancel', requireMinRole('gm'), async (request, env) => {
    const db  = getDb(env);
    const job = await db.get('SELECT id,status FROM repair_jobs WHERE id=?', [request.params.id]);
    if (!job) return err('Repair job not found', 404);
    if (job.status === 'complete') return err('Cannot cancel a completed job', 400);
    await db.run("UPDATE repair_jobs SET status='cancelled' WHERE id=?", [job.id]);
    return ok({ ok: true });
  });
}
