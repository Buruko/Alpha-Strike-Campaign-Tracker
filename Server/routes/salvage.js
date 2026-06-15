/**
 * routes/salvage.js
 *
 * POST /api/salvage/build/:sessionId  — GM builds salvage queue from session enemies
 * GET  /api/salvage/:sessionId        — list salvage queue for a session
 * POST /api/salvage/:id/claim         — QM/GM claims a salvage unit for a player
 * POST /api/salvage/:id/dismiss       — QM/GM dismisses salvage item
 */

const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../db/db');
const { verifyAuth } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/requireRole');
const { calcRepairCost, calcSalvageValue } = require('../lib/repairCalculator');
const { postLedgerEntry } = require('./accounting');

router.use(verifyAuth);

// ── Build salvage queue from session ────────────────────────────────────────
// Includes all enemy units that are destroyed OR still active (non-destroyed salvage)
router.post('/build/:sessionId', requireMinRole('quartermaster'), (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (session.status !== 'post' && session.status !== 'complete') {
    return res.status(400).json({ error: 'Session must be in post or complete status to build salvage' });
  }

  // Get eligible enemies (destroyed or active — not withdrawn)
  const enemies = db.prepare(`
    SELECT * FROM enemy_units
    WHERE session_id = ? AND status != 'withdrawn'
  `).all(session.id);

  if (!enemies.length) {
    return res.json({ built: 0, message: 'No eligible units for salvage' });
  }

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO salvage_queue
      (id, session_id, enemy_unit_id, repair_cost, salvage_value, status, kill_credit_pilot_id)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `);

  let built = 0;
  const buildAll = db.transaction(() => {
    for (const enemy of enemies) {
      // Check if already in queue
      const existing = db.prepare(
        'SELECT id FROM salvage_queue WHERE enemy_unit_id = ?'
      ).get(enemy.id);
      if (existing) continue;

      const repairCost   = calcRepairCost(enemy);
      const salvageValue = calcSalvageValue(enemy);

      insertStmt.run(
        uuid(), session.id, enemy.id,
        repairCost, salvageValue, enemy.kill_credit_pilot_id ?? null
      );
      built++;
    }
  });
  buildAll();

  res.json({ built, total_eligible: enemies.length });
});

// ── Get salvage queue ────────────────────────────────────────────────────────
router.get('/:sessionId', (req, res) => {
  const items = db.prepare(`
    SELECT sq.*,
      eu.name AS unit_name, eu.variant, eu.unit_type, eu.size, eu.base_pv,
      eu.armor_max, eu.structure_max, eu.armor_dmg, eu.structure_dmg,
      eu.engine_dmg, eu.fcu_dmg, eu.mp_dmg, eu.weapon_dmg,
      eu.image_url, eu.status AS unit_status, eu.group_name,
      eu.abilities, eu.move_data, eu.tonnage, eu.role,
      kp.name AS kill_pilot_name,
      pl.callsign AS claimed_by_callsign
    FROM salvage_queue sq
    JOIN enemy_units eu ON eu.id = sq.enemy_unit_id
    LEFT JOIN pilots kp ON kp.id = sq.kill_credit_pilot_id
    LEFT JOIN players pl ON pl.id = sq.claimed_by_player_id
    WHERE sq.session_id = ?
    ORDER BY eu.base_pv DESC
  `).all(req.params.sessionId);

  const enriched = items.map(item => ({
    ...item,
    abilities: tryParse(item.abilities, []),
    move_data: tryParse(item.move_data, []),
  }));

  res.json(enriched);
});

// ── Claim salvage unit (adds to player roster) ───────────────────────────────
router.post('/:id/claim', requireMinRole('quartermaster'), (req, res) => {
  const sq = db.prepare('SELECT * FROM salvage_queue WHERE id = ?').get(req.params.id);
  if (!sq) return res.status(404).json({ error: 'Salvage item not found' });
  if (sq.status !== 'pending') {
    return res.status(400).json({ error: `Salvage item already ${sq.status}` });
  }

  const { player_id } = req.body;
  if (!player_id) return res.status(400).json({ error: 'player_id is required' });

  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(player_id);
  if (!player) return res.status(404).json({ error: 'Player not found' });

  const enemy = db.prepare('SELECT * FROM enemy_units WHERE id = ?').get(sq.enemy_unit_id);
  if (!enemy) return res.status(404).json({ error: 'Enemy unit not found' });

  let newUnitId;
  db.transaction(() => {
    // Add unit to player roster in current damaged state
    newUnitId = uuid();
    db.prepare(`
      INSERT INTO units (
        id, player_id, name, variant, unit_type, size, tonnage, role, tmm,
        base_pv, armor_max, structure_max,
        engine_hits_max, fcu_hits_max, mp_hits_max, weapon_hits_max,
        armor_dmg, structure_dmg, engine_dmg, fcu_dmg, mp_dmg, weapon_dmg,
        abilities, move_data, image_url, status, jeff_uuid
      ) VALUES (
        @id, @player_id, @name, @variant, @unit_type, @size, @tonnage, @role, @tmm,
        @base_pv, @armor_max, @structure_max,
        @engine_hits_max, @fcu_hits_max, @mp_hits_max, @weapon_hits_max,
        @armor_dmg, @structure_dmg, @engine_dmg, @fcu_dmg, @mp_dmg, @weapon_dmg,
        @abilities, @move_data, @image_url, 'active', @jeff_uuid
      )
    `).run({
      id:              newUnitId,
      player_id,
      name:            enemy.name,
      variant:         enemy.variant ?? null,
      unit_type:       enemy.unit_type,
      size:            enemy.size,
      tonnage:         enemy.tonnage ?? null,
      role:            enemy.role ?? null,
      tmm:             enemy.tmm ?? 0,
      base_pv:         enemy.base_pv,
      armor_max:       enemy.armor_max,
      structure_max:   enemy.structure_max,
      engine_hits_max: enemy.engine_hits_max,
      fcu_hits_max:    enemy.fcu_hits_max,
      mp_hits_max:     enemy.mp_hits_max,
      weapon_hits_max: enemy.weapon_hits_max,
      armor_dmg:       enemy.armor_dmg,
      structure_dmg:   enemy.structure_dmg,
      engine_dmg:      enemy.engine_dmg,
      fcu_dmg:         enemy.fcu_dmg,
      mp_dmg:          enemy.mp_dmg,
      weapon_dmg:      enemy.weapon_dmg,
      abilities:       enemy.abilities,
      move_data:       enemy.move_data,
      image_url:       enemy.image_url ?? null,
      jeff_uuid:       enemy.jeff_uuid ?? null,
    });

    // Credit salvage value to campaign account
    postLedgerEntry({
      type:        'deposit_salvage_value',
      amount:      sq.salvage_value,
      description: `Salvage claimed: ${enemy.name} → ${player.callsign}`,
      unitId:      newUnitId,
      salvageId:   sq.id,
      createdBy:   req.user.id,
    });

    // Mark queue item claimed
    db.prepare(`
      UPDATE salvage_queue
      SET status = 'claimed', claimed_by_player_id = ?, claimed_at = datetime('now')
      WHERE id = ?
    `).run(player_id, sq.id);

    // Notify player
    const owner = db.prepare('SELECT user_id FROM players WHERE id = ?').get(player_id);
    if (owner) {
      db.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body)
        VALUES (?, ?, 'general', 'Salvaged unit added to your roster', ?)
      `).run(
        uuid(), owner.user_id,
        `${enemy.name} has been added to your roster. Repair cost: ${sq.repair_cost} pts.`
      );
    }
  })();

  res.json({
    ok:          true,
    new_unit_id: newUnitId,
    salvage_value: sq.salvage_value,
    repair_cost:   sq.repair_cost,
    balance:       db.prepare('SELECT balance FROM campaign_account WHERE id = 1').get().balance,
  });
});

// ── Dismiss salvage item ─────────────────────────────────────────────────────
router.post('/:id/dismiss', requireMinRole('quartermaster'), (req, res) => {
  const sq = db.prepare('SELECT id, status FROM salvage_queue WHERE id = ?').get(req.params.id);
  if (!sq) return res.status(404).json({ error: 'Salvage item not found' });
  if (sq.status !== 'pending') {
    return res.status(400).json({ error: `Item is already ${sq.status}` });
  }
  db.prepare(`UPDATE salvage_queue SET status = 'dismissed' WHERE id = ?`).run(sq.id);
  res.json({ ok: true });
});

function tryParse(v, fb) { try { return v ? JSON.parse(v) : fb; } catch { return fb; } }

module.exports = router;
