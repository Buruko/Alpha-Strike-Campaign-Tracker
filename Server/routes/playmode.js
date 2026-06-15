/**
 * routes/playmode.js
 *
 * POST /api/play/import           — GM imports Jeff JSON → creates enemy units
 * POST /api/play/preview          — preview Jeff JSON without saving
 * GET  /api/play/session/:id      — get all enemy units for a session
 * POST /api/play/enemy            — GM manually adds single enemy unit
 * PATCH /api/play/enemy/:id       — update enemy unit damage
 * POST /api/play/enemy/:id/damage-log — log pilot damage against enemy this turn
 * GET  /api/play/enemy/:id/damage-log — get pilots who damaged enemy this turn
 * POST /api/play/enemy/:id/kill   — assign kill credit (redirects to xp/kill)
 * POST /api/play/session/:id/turn — advance turn counter
 */

const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../db/db');
const { verifyAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { parseJeffExport, previewJeffExport } = require('../lib/jeffImporter');
const { calcRepairCost, calcCostPerPip } = require('../lib/repairCalculator');
const { calcKillXP } = require('../lib/xpCalculator');
const { awardXpToPilot } = require('./xp');

router.use(verifyAuth);
router.use(requireRole('gm'));

function enrichEnemy(unit) {
  const repairCost = calcRepairCost(unit);
  return {
    ...unit,
    repair_cost_current: repairCost,
    salvage_value: Math.max(1, unit.base_pv - repairCost),
    abilities: tryParse(unit.abilities, []),
    move_data:  tryParse(unit.move_data,  []),
  };
}
function tryParse(v, fb) { try { return v ? JSON.parse(v) : fb; } catch { return fb; } }

// ── Preview Jeff import ──────────────────────────────────────────────────────
router.post('/preview', (req, res) => {
  const { json } = req.body;
  if (!json) return res.status(400).json({ error: 'json is required' });

  const result = previewJeffExport(json);
  res.json(result);
});

// ── Import Jeff JSON into a session ─────────────────────────────────────────
router.post('/import', (req, res) => {
  const { session_id, json } = req.body;
  if (!session_id || !json) {
    return res.status(400).json({ error: 'session_id and json are required' });
  }

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session_id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { units, groups, errors } = parseJeffExport(json, session_id);
  if (!units.length) {
    return res.status(400).json({ error: 'No units parsed', details: errors });
  }

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO enemy_units (
      id, session_id, jeff_uuid, name, variant, unit_type, size, base_pv,
      tonnage, role, tmm, pilot_skill,
      armor_max, structure_max, engine_hits_max, fcu_hits_max, mp_hits_max, weapon_hits_max,
      armor_dmg, structure_dmg, engine_dmg, fcu_dmg, mp_dmg, weapon_dmg,
      status, abilities, move_data, image_url, group_name
    ) VALUES (
      @id, @session_id, @jeff_uuid, @name, @variant, @unit_type, @size, @base_pv,
      @tonnage, @role, @tmm, @pilot_skill,
      @armor_max, @structure_max, @engine_hits_max, @fcu_hits_max, @mp_hits_max, @weapon_hits_max,
      @armor_dmg, @structure_dmg, @engine_dmg, @fcu_dmg, @mp_dmg, @weapon_dmg,
      @status, @abilities, @move_data, @image_url, @group_name
    )
  `);

  const imported = [];
  const importAll = db.transaction(() => {
    for (const u of units) {
      const id = uuid();
      insertStmt.run({ ...u, id });
      imported.push(id);
    }
  });
  importAll();

  res.status(201).json({
    imported:    imported.length,
    groups,
    errors,
    unit_ids:    imported,
  });
});

// ── Get session enemy units ──────────────────────────────────────────────────
router.get('/session/:id', (req, res) => {
  const units = db.prepare('SELECT * FROM enemy_units WHERE session_id = ? ORDER BY group_name, name')
    .all(req.params.id);

  // Attach kill credit pilot name
  const enriched = units.map(u => {
    const killPilot = u.kill_credit_pilot_id
      ? db.prepare('SELECT id, name FROM pilots WHERE id = ?').get(u.kill_credit_pilot_id)
      : null;
    return { ...enrichEnemy(u), kill_credit_pilot: killPilot };
  });

  // Group by lance
  const grouped = {};
  for (const u of enriched) {
    const g = u.group_name || 'Ungrouped';
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(u);
  }

  res.json({ units: enriched, grouped });
});

// ── Manually add single enemy unit ──────────────────────────────────────────
router.post('/enemy', (req, res) => {
  const {
    session_id, name, variant, unit_type, size, base_pv,
    armor_max, structure_max, pilot_skill, group_name,
    engine_hits_max, fcu_hits_max, mp_hits_max, weapon_hits_max,
    tonnage, role, tmm, abilities, move_data, image_url,
  } = req.body;

  if (!session_id || !name || !unit_type || !base_pv || !armor_max || !structure_max) {
    return res.status(400).json({ error: 'Required: session_id, name, unit_type, base_pv, armor_max, structure_max' });
  }

  const id = uuid();
  db.prepare(`
    INSERT INTO enemy_units (
      id, session_id, name, variant, unit_type, size, base_pv,
      armor_max, structure_max, engine_hits_max, fcu_hits_max, mp_hits_max, weapon_hits_max,
      pilot_skill, group_name, tonnage, role, tmm, abilities, move_data, image_url
    ) VALUES (
      @id, @session_id, @name, @variant, @unit_type, @size, @base_pv,
      @armor_max, @structure_max, @engine_hits_max, @fcu_hits_max, @mp_hits_max, @weapon_hits_max,
      @pilot_skill, @group_name, @tonnage, @role, @tmm, @abilities, @move_data, @image_url
    )
  `).run({
    id, session_id, name, variant: variant ?? null, unit_type,
    size: size ?? 1, base_pv,
    armor_max, structure_max,
    engine_hits_max: engine_hits_max ?? 2,
    fcu_hits_max:    fcu_hits_max    ?? 4,
    mp_hits_max:     mp_hits_max     ?? 4,
    weapon_hits_max: weapon_hits_max ?? 4,
    pilot_skill: pilot_skill ?? 4, group_name: group_name ?? null,
    tonnage: tonnage ?? null, role: role ?? null, tmm: tmm ?? 0,
    abilities: abilities ? JSON.stringify(abilities) : null,
    move_data: move_data ? JSON.stringify(move_data) : null,
    image_url: image_url ?? null,
  });

  res.status(201).json(enrichEnemy(db.prepare('SELECT * FROM enemy_units WHERE id = ?').get(id)));
});

// ── Update enemy unit damage ─────────────────────────────────────────────────
router.patch('/enemy/:id', (req, res) => {
  const unit = db.prepare('SELECT * FROM enemy_units WHERE id = ?').get(req.params.id);
  if (!unit) return res.status(404).json({ error: 'Enemy unit not found' });

  const fields = ['armor_dmg','structure_dmg','engine_dmg','fcu_dmg','mp_dmg','weapon_dmg','status'];
  const maxMap = {
    armor_dmg: unit.armor_max, structure_dmg: unit.structure_max,
    engine_dmg: unit.engine_hits_max, fcu_dmg: unit.fcu_hits_max,
    mp_dmg: unit.mp_hits_max, weapon_dmg: unit.weapon_hits_max,
  };

  const updates = {};
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      if (f === 'status') {
        if (!['active','destroyed','withdrawn'].includes(req.body[f])) {
          return res.status(400).json({ error: `Invalid status: ${req.body[f]}` });
        }
        updates[f] = req.body[f];
      } else {
        const val = parseInt(req.body[f], 10);
        if (isNaN(val) || val < 0 || val > maxMap[f]) {
          return res.status(400).json({ error: `${f} out of range (0–${maxMap[f]})` });
        }
        updates[f] = val;
      }
    }
  }

  if (!Object.keys(updates).length) return res.status(400).json({ error: 'No valid fields' });
  const set = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE enemy_units SET ${set} WHERE id = @id`).run({ ...updates, id: unit.id });

  res.json(enrichEnemy(db.prepare('SELECT * FROM enemy_units WHERE id = ?').get(unit.id)));
});

// ── Log pilot damage against enemy this turn ─────────────────────────────────
router.post('/enemy/:id/damage-log', (req, res) => {
  const { pilot_id, damage_type, turn_number, session_id } = req.body;
  const enemy = db.prepare('SELECT * FROM enemy_units WHERE id = ?').get(req.params.id);
  if (!enemy) return res.status(404).json({ error: 'Enemy unit not found' });
  if (!pilot_id || !damage_type || !session_id) {
    return res.status(400).json({ error: 'pilot_id, damage_type, session_id required' });
  }

  const id = uuid();
  db.prepare(`
    INSERT INTO kill_damage_log (id, enemy_unit_id, pilot_id, session_id, damage_type, turn_number)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, enemy.id, pilot_id, session_id, damage_type, turn_number ?? 1);

  res.status(201).json({ ok: true });
});

// ── Get pilots who damaged enemy this turn ───────────────────────────────────
router.get('/enemy/:id/damage-log', (req, res) => {
  const { turn } = req.query;
  const enemy = db.prepare('SELECT id FROM enemy_units WHERE id = ?').get(req.params.id);
  if (!enemy) return res.status(404).json({ error: 'Enemy unit not found' });

  let q = `
    SELECT kdl.*, p.name AS pilot_name, pl.callsign AS player_callsign
    FROM kill_damage_log kdl
    JOIN pilots p ON p.id = kdl.pilot_id
    JOIN players pl ON pl.id = p.player_id
    WHERE kdl.enemy_unit_id = ?
  `;
  const params = [enemy.id];
  if (turn) { q += ' AND kdl.turn_number = ?'; params.push(parseInt(turn)); }
  q += ' ORDER BY kdl.logged_at DESC';

  res.json(db.prepare(q).all(...params));
});

// ── Assign kill credit + award XP ────────────────────────────────────────────
router.post('/enemy/:id/kill', async (req, res) => {
  const { pilot_id, session_id } = req.body;
  const enemy = db.prepare('SELECT * FROM enemy_units WHERE id = ?').get(req.params.id);
  if (!enemy) return res.status(404).json({ error: 'Enemy unit not found' });
  if (!pilot_id || !session_id) {
    return res.status(400).json({ error: 'pilot_id and session_id required' });
  }

  const pilot = db.prepare('SELECT * FROM pilots WHERE id = ?').get(pilot_id);
  if (!pilot) return res.status(404).json({ error: 'Pilot not found' });

  const { xp, baseXp, multiplier, disparity } = calcKillXP(
    enemy.unit_type, enemy.size, pilot.skill, enemy.pilot_skill
  );

  const notes = `Kill: ${enemy.name} (${enemy.unit_type} sz${enemy.size}) | ` +
                `Base ${baseXp} × ${multiplier} (disparity ${disparity >= 0 ? '+' : ''}${disparity})`;

  try {
    const result = awardXpToPilot(pilot_id, xp, 'kill', notes, session_id, req.user.id);

    db.prepare(`
      UPDATE enemy_units SET kill_credit_pilot_id = ?, status = 'destroyed' WHERE id = ?
    `).run(pilot_id, enemy.id);

    res.json({ ...result, xp, baseXp, multiplier, disparity });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Advance turn ─────────────────────────────────────────────────────────────
router.post('/session/:id/turn', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  // Turn is tracked client-side during play; server just echoes
  res.json({ ok: true });
});

module.exports = router;
