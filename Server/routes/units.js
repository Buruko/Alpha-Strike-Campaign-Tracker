/**
 * routes/units.js
 *
 * GET    /api/units                   — scoped by role
 * GET    /api/units/:id               — unit detail with repair cost breakdown
 * POST   /api/units                   — QM/GM create unit
 * PATCH  /api/units/:id               — update unit fields
 * PATCH  /api/units/:id/damage        — apply damage during play (player/gm)
 * DELETE /api/units/:id               — GM only retire/remove
 * POST   /api/units/:id/assign-pilot  — QM/GM assign pilot to unit
 * POST   /api/units/:id/unassign-pilot — QM/GM unassign current pilot
 * GET    /api/units/:id/sale-value    — calculated sale value with breakdown
 */

const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db     = require('../db/db');
const { verifyAuth }    = require('../middleware/auth');
const { requireRole, requireMinRole } = require('../middleware/requireRole');
const {
  calcRepairCost,
  calcSaleValue,
  calcSalvageValue,
  calcCostPerPip,
} = require('../lib/repairCalculator');

router.use(verifyAuth);

function enrichUnit(unit) {
  const repairCost = calcRepairCost(unit);
  const costPerPip = calcCostPerPip(unit.base_pv, unit.armor_max);
  return {
    ...unit,
    repair_cost_current: repairCost,
    cost_per_pip:        costPerPip,
    abilities: tryParse(unit.abilities, []),
    move_data: tryParse(unit.move_data, []),
  };
}

function tryParse(val, fallback) {
  try { return val ? JSON.parse(val) : fallback; } catch { return fallback; }
}

// ── List units ───────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { role, player_id } = req.user;
  let units;

  if (role === 'player') {
    units = db.prepare(`
      SELECT u.*, pl.callsign AS player_callsign
      FROM units u JOIN players pl ON pl.id = u.player_id
      WHERE u.player_id = ? AND u.status != 'retired'
      ORDER BY u.name
    `).all(player_id);
  } else {
    units = db.prepare(`
      SELECT u.*, pl.callsign AS player_callsign
      FROM units u JOIN players pl ON pl.id = u.player_id
      WHERE u.status != 'retired'
      ORDER BY pl.callsign, u.name
    `).all();
  }

  // Attach current pilot assignment
  const withPilots = units.map(unit => {
    const pilot = db.prepare(`
      SELECT p.id, p.name, p.skill, p.rank
      FROM pilot_unit_assignments pua
      JOIN pilots p ON p.id = pua.pilot_id
      WHERE pua.unit_id = ? AND pua.unassigned_at IS NULL
      LIMIT 1
    `).get(unit.id);
    return { ...enrichUnit(unit), current_pilot: pilot ?? null };
  });

  res.json(withPilots);
});

// ── Get unit detail ──────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const unit = db.prepare(`
    SELECT u.*, pl.callsign AS player_callsign
    FROM units u JOIN players pl ON pl.id = u.player_id
    WHERE u.id = ?
  `).get(req.params.id);

  if (!unit) return res.status(404).json({ error: 'Unit not found' });

  const { role, player_id } = req.user;
  if (role === 'player' && unit.player_id !== player_id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const pilot = db.prepare(`
    SELECT p.* FROM pilot_unit_assignments pua
    JOIN pilots p ON p.id = pua.pilot_id
    WHERE pua.unit_id = ? AND pua.unassigned_at IS NULL LIMIT 1
  `).get(unit.id);

  const repairHistory = db.prepare(`
    SELECT rj.*, u.username AS tech_username
    FROM repair_jobs rj
    LEFT JOIN users u ON u.id = rj.technician_user_id
    WHERE rj.unit_id = ?
    ORDER BY rj.created_at DESC LIMIT 20
  `).all(unit.id);

  res.json({
    ...enrichUnit(unit),
    current_pilot:  pilot ?? null,
    repair_history: repairHistory,
  });
});

// ── Create unit (QM / GM) ────────────────────────────────────────────────────
router.post('/', requireMinRole('quartermaster'), (req, res) => {
  const {
    player_id, name, variant, unit_type, size, tonnage, role,
    tmm, base_pv, armor_max, structure_max,
    engine_hits_max, fcu_hits_max, mp_hits_max, weapon_hits_max,
    abilities, move_data, image_url, jump_move, jeff_uuid,
  } = req.body;

  if (!player_id || !name || !unit_type || !base_pv || !armor_max || !structure_max) {
    return res.status(400).json({
      error: 'Required: player_id, name, unit_type, base_pv, armor_max, structure_max',
    });
  }

  const player = db.prepare('SELECT id FROM players WHERE id = ?').get(player_id);
  if (!player) return res.status(404).json({ error: 'Player not found' });

  const id = uuid();
  db.prepare(`
    INSERT INTO units (
      id, player_id, name, variant, unit_type, size, tonnage, role, tmm,
      base_pv, armor_max, structure_max,
      engine_hits_max, fcu_hits_max, mp_hits_max, weapon_hits_max,
      abilities, move_data, image_url, jump_move, jeff_uuid, status
    ) VALUES (
      @id, @player_id, @name, @variant, @unit_type, @size, @tonnage, @role, @tmm,
      @base_pv, @armor_max, @structure_max,
      @engine_hits_max, @fcu_hits_max, @mp_hits_max, @weapon_hits_max,
      @abilities, @move_data, @image_url, @jump_move, @jeff_uuid, 'active'
    )
  `).run({
    id, player_id, name, variant: variant ?? null,
    unit_type, size: size ?? 1, tonnage: tonnage ?? null,
    role: role ?? null, tmm: tmm ?? 0, base_pv,
    armor_max, structure_max,
    engine_hits_max: engine_hits_max ?? 2,
    fcu_hits_max:    fcu_hits_max    ?? 4,
    mp_hits_max:     mp_hits_max     ?? 4,
    weapon_hits_max: weapon_hits_max ?? 4,
    abilities:  abilities  ? JSON.stringify(abilities)  : null,
    move_data:  move_data  ? JSON.stringify(move_data)  : null,
    image_url:  image_url  ?? null,
    jump_move:  jump_move  ?? 0,
    jeff_uuid:  jeff_uuid  ?? null,
  });

  // Auto-debit purchase cost from campaign account
  const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(id);
  debitAccount(base_pv, `Purchased unit: ${name}`, id, null, req.user.id);

  res.status(201).json(enrichUnit(unit));
});

// ── Update unit fields (QM / GM) ─────────────────────────────────────────────
router.patch('/:id', requireMinRole('quartermaster'), (req, res) => {
  const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id);
  if (!unit) return res.status(404).json({ error: 'Unit not found' });

  const allowed = [
    'name','variant','unit_type','size','tonnage','role','tmm','base_pv',
    'armor_max','structure_max','engine_hits_max','fcu_hits_max',
    'mp_hits_max','weapon_hits_max','image_url','jump_move','status',
  ];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  const setClause = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE units SET ${setClause} WHERE id = @id`).run({ ...updates, id: unit.id });

  res.json(enrichUnit(db.prepare('SELECT * FROM units WHERE id = ?').get(unit.id)));
});

// ── Apply damage (player on own unit, GM on any) ─────────────────────────────
router.patch('/:id/damage', (req, res) => {
  const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id);
  if (!unit) return res.status(404).json({ error: 'Unit not found' });

  const { role, player_id } = req.user;
  if (role === 'player' && unit.player_id !== player_id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const fields = ['armor_dmg','structure_dmg','engine_dmg','fcu_dmg','mp_dmg','weapon_dmg'];
  const maxMap  = {
    armor_dmg: unit.armor_max, structure_dmg: unit.structure_max,
    engine_dmg: unit.engine_hits_max, fcu_dmg: unit.fcu_hits_max,
    mp_dmg: unit.mp_hits_max, weapon_dmg: unit.weapon_hits_max,
  };

  const updates = {};
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      const val = parseInt(req.body[f], 10);
      if (isNaN(val) || val < 0 || val > maxMap[f]) {
        return res.status(400).json({ error: `${f} out of range (0–${maxMap[f]})` });
      }
      updates[f] = val;
    }
  }

  if (!Object.keys(updates).length) return res.status(400).json({ error: 'No damage fields provided' });

  const setClause = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE units SET ${setClause} WHERE id = @id`).run({ ...updates, id: unit.id });

  res.json(enrichUnit(db.prepare('SELECT * FROM units WHERE id = ?').get(unit.id)));
});

// ── Assign pilot to unit (QM / GM) ───────────────────────────────────────────
router.post('/:id/assign-pilot', requireMinRole('quartermaster'), (req, res) => {
  const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id);
  if (!unit) return res.status(404).json({ error: 'Unit not found' });

  const { pilot_id } = req.body;
  if (!pilot_id) return res.status(400).json({ error: 'pilot_id required' });

  const pilot = db.prepare('SELECT * FROM pilots WHERE id = ?').get(pilot_id);
  if (!pilot) return res.status(404).json({ error: 'Pilot not found' });

  db.transaction(() => {
    // Unassign any currently assigned pilot from this unit
    db.prepare(`
      UPDATE pilot_unit_assignments SET unassigned_at = datetime('now')
      WHERE unit_id = ? AND unassigned_at IS NULL
    `).run(unit.id);

    // Unassign this pilot from any current unit
    db.prepare(`
      UPDATE pilot_unit_assignments SET unassigned_at = datetime('now')
      WHERE pilot_id = ? AND unassigned_at IS NULL
    `).run(pilot_id);

    // Create new assignment
    db.prepare(`
      INSERT INTO pilot_unit_assignments (id, pilot_id, unit_id) VALUES (?, ?, ?)
    `).run(uuid(), pilot_id, unit.id);
  })();

  res.json({ ok: true, pilot_id, unit_id: unit.id });
});

// ── Unassign pilot from unit (QM / GM) ───────────────────────────────────────
router.post('/:id/unassign-pilot', requireMinRole('quartermaster'), (req, res) => {
  const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id);
  if (!unit) return res.status(404).json({ error: 'Unit not found' });

  db.prepare(`
    UPDATE pilot_unit_assignments SET unassigned_at = datetime('now')
    WHERE unit_id = ? AND unassigned_at IS NULL
  `).run(unit.id);

  res.json({ ok: true });
});

// ── Sale value breakdown ─────────────────────────────────────────────────────
router.get('/:id/sale-value', (req, res) => {
  const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id);
  if (!unit) return res.status(404).json({ error: 'Unit not found' });

  const result = calcSaleValue(unit);
  res.json(result);
});

// ── Delete / retire unit (GM only) ──────────────────────────────────────────
router.delete('/:id', requireRole('gm'), (req, res) => {
  const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id);
  if (!unit) return res.status(404).json({ error: 'Unit not found' });
  db.prepare(`UPDATE units SET status = 'retired' WHERE id = ?`).run(unit.id);
  res.json({ ok: true });
});

// ── Internal helper: debit campaign account ──────────────────────────────────
function debitAccount(amount, description, unitId, sessionId, createdBy) {
  const acct = db.prepare('SELECT balance FROM campaign_account WHERE id = 1').get();
  const newBalance = (acct?.balance ?? 0) - amount;
  db.prepare('UPDATE campaign_account SET balance = ? WHERE id = 1').run(newBalance);
  db.prepare(`
    INSERT INTO account_ledger (id, type, amount, balance_after, description, unit_id, session_id, created_by)
    VALUES (?, 'withdraw_purchase', ?, ?, ?, ?, ?, ?)
  `).run(uuid(), amount, newBalance, description, unitId ?? null, sessionId ?? null, createdBy);
}

module.exports = router;
