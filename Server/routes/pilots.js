/**
 * routes/pilots.js
 *
 * GET    /api/pilots              — player: own; gm/qm: all
 * GET    /api/pilots/:id          — pilot detail with PSAs and XP log
 * POST   /api/pilots              — player creates own pilot (GM can create for any player)
 * PATCH  /api/pilots/:id          — update pilot fields
 * DELETE /api/pilots/:id          — GM only
 * POST   /api/pilots/:id/psa      — player selects a PSA for pending slot
 * GET    /api/pilots/:id/rank-status — eligibility and next rank info
 * POST   /api/pilots/:id/dismiss-rankup — dismiss rank-up pending flag (after PSA flow)
 */

const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db     = require('../db/db');
const { verifyAuth }    = require('../middleware/auth');
const { requireRole, requireMinRole } = require('../middleware/requireRole');
const { getRankDef, getNextRankDef, checkRankEligibility } = require('../lib/rankEngine');

router.use(verifyAuth);

// ── Helper: assert pilot ownership or gm/qm access ──────────────────────────
function assertAccess(req, pilot) {
  if (!pilot) return 'not_found';
  const { role, player_id } = req.user;
  if (role === 'gm' || role === 'quartermaster') return 'ok';
  if (role === 'player' && pilot.player_id === player_id) return 'ok';
  return 'forbidden';
}

// ── List pilots ──────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { role, player_id } = req.user;
  let pilots;

  if (role === 'player') {
    pilots = db.prepare(`
      SELECT p.*, pl.callsign AS player_callsign
      FROM pilots p
      JOIN players pl ON pl.id = p.player_id
      WHERE p.player_id = ?
      ORDER BY p.name
    `).all(player_id);
  } else {
    pilots = db.prepare(`
      SELECT p.*, pl.callsign AS player_callsign
      FROM pilots p
      JOIN players pl ON pl.id = p.player_id
      ORDER BY pl.callsign, p.name
    `).all();
  }

  // Attach current unit assignment for each pilot
  const withUnits = pilots.map(pilot => {
    const unit = db.prepare(`
      SELECT u.id, u.name, u.variant, u.unit_type, u.size, u.base_pv, u.status
      FROM pilot_unit_assignments pua
      JOIN units u ON u.id = pua.unit_id
      WHERE pua.pilot_id = ? AND pua.unassigned_at IS NULL
      LIMIT 1
    `).get(pilot.id);
    return { ...pilot, current_unit: unit ?? null };
  });

  res.json(withUnits);
});

// ── Get pilot detail ─────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const pilot = db.prepare(`
    SELECT p.*, pl.callsign AS player_callsign, u.username AS player_username
    FROM pilots p
    JOIN players pl ON pl.id = p.player_id
    JOIN users u ON u.id = pl.user_id
    WHERE p.id = ?
  `).get(req.params.id);

  const access = assertAccess(req, pilot);
  if (access === 'not_found') return res.status(404).json({ error: 'Pilot not found' });
  if (access === 'forbidden') return res.status(403).json({ error: 'Access denied' });

  const psas = db.prepare(`
    SELECT pp.*, pd.name, pd.description, pd.min_rank
    FROM pilot_psas pp
    JOIN psa_definitions pd ON pd.id = pp.psa_def_id
    WHERE pp.pilot_id = ?
    ORDER BY pp.slot_index
  `).all(pilot.id);

  const xpLog = db.prepare(`
    SELECT * FROM xp_events WHERE pilot_id = ? ORDER BY occurred_at DESC LIMIT 50
  `).all(pilot.id);

  const currentUnit = db.prepare(`
    SELECT u.*, pua.assigned_at
    FROM pilot_unit_assignments pua
    JOIN units u ON u.id = pua.unit_id
    WHERE pua.pilot_id = ? AND pua.unassigned_at IS NULL
    LIMIT 1
  `).get(pilot.id);

  const rankDef     = getRankDef(pilot.rank);
  const nextRankDef = getNextRankDef(pilot.rank);
  const eligibility = checkRankEligibility(pilot);

  res.json({
    ...pilot,
    psas,
    xp_log:       xpLog,
    current_unit: currentUnit ?? null,
    rank_def:     rankDef,
    next_rank_def: nextRankDef,
    rank_eligibility: eligibility,
  });
});

// ── Create pilot ─────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { role, player_id: requesterPlayerId } = req.user;
  let { name, player_id, skill } = req.body;

  if (!name) return res.status(400).json({ error: 'name is required' });

  // Players can only create pilots for themselves
  if (role === 'player') {
    player_id = requesterPlayerId;
  } else if (!player_id) {
    return res.status(400).json({ error: 'player_id is required' });
  }

  const player = db.prepare('SELECT id FROM players WHERE id = ?').get(player_id);
  if (!player) return res.status(404).json({ error: 'Player not found' });

  const id = uuid();
  db.prepare(`
    INSERT INTO pilots (id, player_id, name, skill, rank, xp_total, psa_slots_available, psa_slots_used)
    VALUES (?, ?, ?, ?, 0, 0, 0, 0)
  `).run(id, player_id, name.trim(), skill ?? 4);

  const pilot = db.prepare('SELECT * FROM pilots WHERE id = ?').get(id);
  res.status(201).json(pilot);
});

// ── Update pilot ─────────────────────────────────────────────────────────────
router.patch('/:id', (req, res) => {
  const pilot = db.prepare('SELECT * FROM pilots WHERE id = ?').get(req.params.id);
  const access = assertAccess(req, pilot);
  if (access === 'not_found') return res.status(404).json({ error: 'Pilot not found' });
  if (access === 'forbidden') return res.status(403).json({ error: 'Access denied' });

  // Players can only update pilot name
  const { role } = req.user;
  const allowed = role === 'gm'
    ? ['name', 'skill', 'rank', 'xp_total', 'psa_slots_available', 'psa_slots_used']
    : ['name'];

  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  const setClause = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE pilots SET ${setClause} WHERE id = @id`)
    .run({ ...updates, id: pilot.id });

  res.json(db.prepare('SELECT * FROM pilots WHERE id = ?').get(pilot.id));
});

// ── Delete pilot (GM only) ───────────────────────────────────────────────────
router.delete('/:id', requireRole('gm'), (req, res) => {
  const pilot = db.prepare('SELECT id FROM pilots WHERE id = ?').get(req.params.id);
  if (!pilot) return res.status(404).json({ error: 'Pilot not found' });
  db.prepare('DELETE FROM pilots WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Select PSA ───────────────────────────────────────────────────────────────
router.post('/:id/psa', (req, res) => {
  const pilot = db.prepare('SELECT * FROM pilots WHERE id = ?').get(req.params.id);
  const access = assertAccess(req, pilot);
  if (access === 'not_found') return res.status(404).json({ error: 'Pilot not found' });
  if (access === 'forbidden') return res.status(403).json({ error: 'Access denied' });

  const { psa_def_id } = req.body;
  if (!psa_def_id) return res.status(400).json({ error: 'psa_def_id is required' });

  const psaDef = db.prepare('SELECT * FROM psa_definitions WHERE id = ?').get(psa_def_id);
  if (!psaDef) return res.status(404).json({ error: 'PSA definition not found' });

  if (psaDef.min_rank > pilot.rank) {
    return res.status(400).json({
      error: `This PSA requires rank ${psaDef.min_rank}. Pilot is rank ${pilot.rank}.`,
    });
  }

  const slotsUsed = pilot.psa_slots_used;
  const slotsAvailable = pilot.psa_slots_available;
  if (slotsUsed >= slotsAvailable) {
    return res.status(400).json({ error: 'No PSA slots available' });
  }

  const already = db.prepare(
    'SELECT id FROM pilot_psas WHERE pilot_id = ? AND psa_def_id = ?'
  ).get(pilot.id, psa_def_id);
  if (already) return res.status(409).json({ error: 'PSA already selected' });

  const selectPsa = db.transaction(() => {
    const id = uuid();
    db.prepare(`
      INSERT INTO pilot_psas (id, pilot_id, psa_def_id, slot_index)
      VALUES (?, ?, ?, ?)
    `).run(id, pilot.id, psa_def_id, slotsUsed + 1);

    db.prepare('UPDATE pilots SET psa_slots_used = psa_slots_used + 1 WHERE id = ?')
      .run(pilot.id);
  });

  selectPsa();

  const updated = db.prepare('SELECT * FROM pilots WHERE id = ?').get(pilot.id);
  res.status(201).json(updated);
});

// ── Rank status ──────────────────────────────────────────────────────────────
router.get('/:id/rank-status', (req, res) => {
  const pilot = db.prepare('SELECT * FROM pilots WHERE id = ?').get(req.params.id);
  const access = assertAccess(req, pilot);
  if (access === 'not_found') return res.status(404).json({ error: 'Pilot not found' });
  if (access === 'forbidden') return res.status(403).json({ error: 'Access denied' });

  res.json({
    current_rank:  getRankDef(pilot.rank),
    next_rank:     getNextRankDef(pilot.rank),
    eligibility:   checkRankEligibility(pilot),
    psa_slots_available: pilot.psa_slots_available,
    psa_slots_used:      pilot.psa_slots_used,
    xp_total:            pilot.xp_total,
  });
});

// ── Dismiss rank-up pending (after PSA selection modal is complete) ──────────
router.post('/:id/dismiss-rankup', (req, res) => {
  const pilot = db.prepare('SELECT * FROM pilots WHERE id = ?').get(req.params.id);
  const access = assertAccess(req, pilot);
  if (access === 'not_found') return res.status(404).json({ error: 'Pilot not found' });
  if (access === 'forbidden') return res.status(403).json({ error: 'Access denied' });

  db.prepare('UPDATE pilots SET rank_up_pending = 0 WHERE id = ?').run(pilot.id);

  // Mark related rank_up notifications as read
  db.prepare(`
    UPDATE notifications SET read = 1
    WHERE pilot_id = ? AND type = 'rank_up' AND read = 0
  `).run(pilot.id);

  res.json({ ok: true });
});

// ── List available PSAs for a pilot ─────────────────────────────────────────
router.get('/:id/available-psas', (req, res) => {
  const pilot = db.prepare('SELECT * FROM pilots WHERE id = ?').get(req.params.id);
  const access = assertAccess(req, pilot);
  if (access === 'not_found') return res.status(404).json({ error: 'Pilot not found' });
  if (access === 'forbidden') return res.status(403).json({ error: 'Access denied' });

  const taken = db.prepare(
    'SELECT psa_def_id FROM pilot_psas WHERE pilot_id = ?'
  ).all(pilot.id).map(r => r.psa_def_id);

  const available = db.prepare(`
    SELECT * FROM psa_definitions
    WHERE min_rank <= ?
    ORDER BY min_rank, name
  `).all(pilot.rank).filter(p => !taken.includes(p.id));

  res.json(available);
});

module.exports = router;
