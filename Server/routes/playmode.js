import { v4 as uuid } from 'uuid';
import { getDb } from '../db/db.js';
import { requireMinRole } from '../middleware/auth.js';
import { ok, err } from '../lib/response.js';
import { parseJeffExport, previewJeffExport } from '../lib/jeffImporter.js';
import { calcRepairCost } from '../lib/repairCalculator.js';
import { calcKillXP } from '../lib/xpCalculator.js';
import { awardXpToPilot } from './xp.js';

function tryParse(v, fb) { try { return v ? JSON.parse(v) : fb; } catch { return fb; } }

function enrich(u) {
  const rc = calcRepairCost(u);
  return { ...u, repair_cost_current: rc, salvage_value: Math.max(1, u.base_pv - rc),
    abilities: tryParse(u.abilities, []), move_data: tryParse(u.move_data, []) };
}

export function playmodeRoutes(router) {

  router.post('/api/play/preview', requireMinRole('gm'), async (request, env) => {
    const { json } = await request.json().catch(() => ({}));
    if (!json) return err('json required', 400);
    return ok(previewJeffExport(json));
  });

  router.post('/api/play/import', requireMinRole('gm'), async (request, env) => {
    const db = getDb(env);
    const { session_id, json } = await request.json().catch(() => ({}));
    if (!session_id || !json) return err('session_id and json required', 400);
    const session = await db.get('SELECT * FROM sessions WHERE id=?', [session_id]);
    if (!session) return err('Session not found', 404);
    const { units, groups, errors } = parseJeffExport(json, session_id);
    if (!units.length) return err('No units parsed', 400);
    const stmts = units.map(u => {
      const id = uuid();
      return { sql: `INSERT OR IGNORE INTO enemy_units (id,session_id,jeff_uuid,name,variant,unit_type,size,base_pv,tonnage,role,tmm,pilot_skill,armor_max,structure_max,engine_hits_max,fcu_hits_max,mp_hits_max,weapon_hits_max,armor_dmg,structure_dmg,engine_dmg,fcu_dmg,mp_dmg,weapon_dmg,status,abilities,move_data,image_url,group_name) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?,?)`,
        params: [id,u.session_id,u.jeff_uuid??null,u.name,u.variant??null,u.unit_type,u.size,u.base_pv,u.tonnage??null,u.role??null,u.tmm??0,u.pilot_skill,u.armor_max,u.structure_max,u.engine_hits_max,u.fcu_hits_max,u.mp_hits_max,u.weapon_hits_max,u.armor_dmg,u.structure_dmg,u.engine_dmg,u.fcu_dmg,u.mp_dmg,u.weapon_dmg,u.abilities,u.move_data,u.image_url??null,u.group_name??null] };
    });
    await db.batch(stmts);
    return ok({ imported: units.length, groups, errors }, 201);
  });

  router.get('/api/play/session/:id', requireMinRole('gm'), async (request, env) => {
    const db    = getDb(env);
    const units = await db.all('SELECT * FROM enemy_units WHERE session_id=? ORDER BY group_name,name', [request.params.id]);
    const enriched = await Promise.all(units.map(async u => {
      const kp = u.kill_credit_pilot_id ? await db.get('SELECT id,name FROM pilots WHERE id=?', [u.kill_credit_pilot_id]) : null;
      return { ...enrich(u), kill_credit_pilot: kp };
    }));
    const grouped = enriched.reduce((acc, u) => {
      const g = u.group_name || 'Ungrouped'; acc[g] = acc[g] || []; acc[g].push(u); return acc;
    }, {});
    return ok({ units: enriched, grouped });
  });

  router.post('/api/play/enemy', requireMinRole('gm'), async (request, env) => {
    const db   = getDb(env);
    const body = await request.json().catch(() => ({}));
    const { session_id,name,variant,unit_type,size,base_pv,armor_max,structure_max,pilot_skill,group_name,engine_hits_max,fcu_hits_max,mp_hits_max,weapon_hits_max,tonnage,role,tmm,abilities,move_data,image_url } = body;
    if (!session_id||!name||!unit_type||!base_pv||!armor_max||!structure_max) return err('Required: session_id,name,unit_type,base_pv,armor_max,structure_max', 400);
    const id = uuid();
    await db.run(`INSERT INTO enemy_units (id,session_id,name,variant,unit_type,size,base_pv,armor_max,structure_max,engine_hits_max,fcu_hits_max,mp_hits_max,weapon_hits_max,pilot_skill,group_name,tonnage,role,tmm,abilities,move_data,image_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id,session_id,name,variant??null,unit_type,size??1,base_pv,armor_max,structure_max,engine_hits_max??2,fcu_hits_max??4,mp_hits_max??4,weapon_hits_max??4,pilot_skill??4,group_name??null,tonnage??null,role??null,tmm??0,abilities?JSON.stringify(abilities):null,move_data?JSON.stringify(move_data):null,image_url??null]);
    return ok(enrich(await db.get('SELECT * FROM enemy_units WHERE id=?', [id])), 201);
  });

  router.patch('/api/play/enemy/:id', requireMinRole('gm'), async (request, env) => {
    const db   = getDb(env);
    const unit = await db.get('SELECT * FROM enemy_units WHERE id=?', [request.params.id]);
    if (!unit) return err('Enemy unit not found', 404);
    const body   = await request.json().catch(() => ({}));
    const fields = ['armor_dmg','structure_dmg','engine_dmg','fcu_dmg','mp_dmg','weapon_dmg','status'];
    const maxMap = { armor_dmg:unit.armor_max,structure_dmg:unit.structure_max,engine_dmg:unit.engine_hits_max,fcu_dmg:unit.fcu_hits_max,mp_dmg:unit.mp_hits_max,weapon_dmg:unit.weapon_hits_max };
    const updates = {};
    for (const f of fields) {
      if (body[f] !== undefined) {
        if (f === 'status') {
          if (!['active','destroyed','withdrawn'].includes(body[f])) return err(`Invalid status: ${body[f]}`, 400);
          updates[f] = body[f];
        } else {
          const val = parseInt(body[f]);
          if (isNaN(val)||val<0||val>maxMap[f]) return err(`${f} out of range (0–${maxMap[f]})`, 400);
          updates[f] = val;
        }
      }
    }
    if (!Object.keys(updates).length) return err('No valid fields', 400);
    const set = Object.keys(updates).map(k => `${k}=?`).join(', ');
    await db.run(`UPDATE enemy_units SET ${set} WHERE id=?`, [...Object.values(updates), unit.id]);
    return ok(enrich(await db.get('SELECT * FROM enemy_units WHERE id=?', [unit.id])));
  });

  router.post('/api/play/enemy/:id/damage-log', requireMinRole('gm'), async (request, env) => {
    const db = getDb(env);
    const { pilot_id, damage_type, turn_number, session_id } = await request.json().catch(() => ({}));
    const enemy = await db.get('SELECT id FROM enemy_units WHERE id=?', [request.params.id]);
    if (!enemy) return err('Enemy not found', 404);
    if (!pilot_id||!damage_type||!session_id) return err('pilot_id, damage_type, session_id required', 400);
    await db.run('INSERT INTO kill_damage_log (id,enemy_unit_id,pilot_id,session_id,damage_type,turn_number) VALUES (?,?,?,?,?,?)',
      [uuid(), enemy.id, pilot_id, session_id, damage_type, turn_number??1]);
    return ok({ ok: true });
  });

  router.get('/api/play/enemy/:id/damage-log', requireMinRole('gm'), async (request, env) => {
    const db   = getDb(env);
    const turn = new URL(request.url).searchParams.get('turn');
    const enemy = await db.get('SELECT id FROM enemy_units WHERE id=?', [request.params.id]);
    if (!enemy) return err('Enemy not found', 404);
    let q = `SELECT kdl.*,p.name AS pilot_name,pl.callsign AS player_callsign FROM kill_damage_log kdl JOIN pilots p ON p.id=kdl.pilot_id JOIN players pl ON pl.id=p.player_id WHERE kdl.enemy_unit_id=?`;
    const params = [enemy.id];
    if (turn) { q += ' AND kdl.turn_number=?'; params.push(parseInt(turn)); }
    q += ' ORDER BY kdl.logged_at DESC';
    return ok(await db.all(q, params));
  });

  router.post('/api/play/enemy/:id/kill', requireMinRole('gm'), async (request, env) => {
    const db = getDb(env);
    const { pilot_id, session_id } = await request.json().catch(() => ({}));
    const enemy = await db.get('SELECT * FROM enemy_units WHERE id=?', [request.params.id]);
    if (!enemy) return err('Enemy not found', 404);
    if (!pilot_id||!session_id) return err('pilot_id and session_id required', 400);
    const pilot = await db.get('SELECT * FROM pilots WHERE id=?', [pilot_id]);
    if (!pilot) return err('Pilot not found', 404);
    const { xp, baseXp, multiplier, disparity } = calcKillXP(enemy.unit_type, enemy.size, pilot.skill, enemy.pilot_skill);
    const notes = `Kill: ${enemy.name} (${enemy.unit_type} sz${enemy.size}) | Base ${baseXp} × ${multiplier} (disparity ${disparity>=0?'+':''}${disparity})`;
    try {
      const result = await awardXpToPilot(db, pilot_id, xp, 'kill', notes, session_id, request.user.id);
      await db.run("UPDATE enemy_units SET kill_credit_pilot_id=?,status='destroyed' WHERE id=?", [pilot_id, enemy.id]);
      return ok({ ...result, xp, baseXp, multiplier, disparity });
    } catch (e) { return err(e.message, 400); }
  });
}
