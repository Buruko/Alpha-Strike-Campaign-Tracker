/**
 * routes/xp.js
 *
 * POST /api/xp/award           — GM awards XP to one or more pilots
 * POST /api/xp/damage          — record damage XP (TAC, critical, melee)
 * POST /api/xp/kill            — award kill XP with disparity calculation
 * POST /api/xp/objective       — award objective XP
 * GET  /api/xp/pilot/:pilotId  — full XP log for a pilot
 */

const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db     = require('../db/db');
const { verifyAuth }    = require('../middleware/auth');
const { requireRole }   = require('../middleware/requireRole');
const { calcKillXP, DAMAGE_XP } = require('../lib/xpCalculator');
const { checkAndPromote, buildRankUpNotification, getRankDef } = require('../lib/rankEngine');

router.use(verifyAuth);

/**
 * Core function: add XP to a pilot, check for rank-up, create notification.
 * Returns { pilot, promoted, rankUpDef }
 */
function awardXpToPilot(pilotId, amount, eventType, notes, sessionId, awardedBy) {
  return db.transaction(() => {
    const pilot = db.prepare('SELECT * FROM pilots WHERE id = ?').get(pilotId);
    if (!pilot) throw new Error(`Pilot ${pilotId} not found`);

    // Insert XP event
    const eventId = uuid();
    db.prepare(`
      INSERT INTO xp_events (id, pilot_id, session_id, event_type, xp_awarded, notes, awarded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(eventId, pilotId, sessionId ?? null, eventType, amount, notes ?? null, awardedBy);

    // Update pilot XP
    const newXp = pilot.xp_total + amount;
    db.prepare('UPDATE pilots SET xp_total = ? WHERE id = ?').run(newXp, pilotId);

    const updatedPilot = db.prepare('SELECT * FROM pilots WHERE id = ?').get(pilotId);

    // Check for rank-up
    const promotion = checkAndPromote(updatedPilot);
    if (promotion) {
      const { nextRankDef, ...rankFields } = promotion;

      db.prepare(`
        UPDATE pilots SET rank = @rank, skill = @skill,
          psa_slots_available = @psa_slots_available,
          rank_up_pending = 1
        WHERE id = @id
      `).run({ ...rankFields, id: pilotId });

      // Get owner user_id for notification
      const owner = db.prepare(`
        SELECT u.id AS user_id FROM users u
        JOIN players pl ON pl.user_id = u.id
        WHERE pl.id = ?
      `).get(updatedPilot.player_id);

      if (owner) {
        const promotedPilot = db.prepare('SELECT * FROM pilots WHERE id = ?').get(pilotId);
        const notif = buildRankUpNotification(promotedPilot, nextRankDef, owner.user_id);
        db.prepare(`
          INSERT INTO notifications (id, user_id, type, title, body, pilot_id, read)
          VALUES (?, ?, ?, ?, ?, ?, 0)
        `).run(uuid(), notif.user_id, notif.type, notif.title, notif.body, notif.pilot_id);
      }

      return {
        pilot:      db.prepare('SELECT * FROM pilots WHERE id = ?').get(pilotId),
        promoted:   true,
        rankUpDef:  nextRankDef,
      };
    }

    return { pilot: updatedPilot, promoted: false, rankUpDef: null };
  })();
}

// ── Manual XP award (GM) ─────────────────────────────────────────────────────
router.post('/award', requireRole('gm'), (req, res) => {
  const { pilot_id, amount, notes, session_id } = req.body;
  if (!pilot_id || amount == null) {
    return res.status(400).json({ error: 'pilot_id and amount are required' });
  }
  if (amount <= 0) return res.status(400).json({ error: 'amount must be positive' });

  try {
    const result = awardXpToPilot(pilot_id, amount, 'manual', notes, session_id, req.user.id);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Damage XP (GM during play mode) ─────────────────────────────────────────
router.post('/damage', requireRole('gm'), (req, res) => {
  const { pilot_id, damage_type, session_id } = req.body;
  const validTypes = ['damage_tac', 'damage_critical', 'damage_melee'];
  if (!pilot_id || !damage_type) {
    return res.status(400).json({ error: 'pilot_id and damage_type are required' });
  }
  if (!validTypes.includes(damage_type)) {
    return res.status(400).json({ error: `damage_type must be one of: ${validTypes.join(', ')}` });
  }

  const amount = DAMAGE_XP[damage_type];
  try {
    const result = awardXpToPilot(pilot_id, amount, damage_type, null, session_id, req.user.id);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Kill XP ──────────────────────────────────────────────────────────────────
router.post('/kill', requireRole('gm'), (req, res) => {
  const { pilot_id, enemy_unit_id, session_id } = req.body;
  if (!pilot_id || !enemy_unit_id) {
    return res.status(400).json({ error: 'pilot_id and enemy_unit_id are required' });
  }

  const pilot = db.prepare('SELECT * FROM pilots WHERE id = ?').get(pilot_id);
  if (!pilot) return res.status(404).json({ error: 'Pilot not found' });

  const enemy = db.prepare('SELECT * FROM enemy_units WHERE id = ?').get(enemy_unit_id);
  if (!enemy) return res.status(404).json({ error: 'Enemy unit not found' });

  const { xp, baseXp, multiplier, disparity } = calcKillXP(
    enemy.unit_type,
    enemy.size,
    pilot.skill,
    enemy.pilot_skill
  );

  const notes = `Kill: ${enemy.name} (size ${enemy.size} ${enemy.unit_type}) | ` +
                `Base XP: ${baseXp} × ${multiplier} (disparity ${disparity > 0 ? '+' : ''}${disparity})`;

  try {
    const result = awardXpToPilot(pilot_id, xp, 'kill', notes, session_id, req.user.id);

    // Mark kill credit on enemy unit
    db.prepare(`
      UPDATE enemy_units SET kill_credit_pilot_id = ?, status = 'destroyed' WHERE id = ?
    `).run(pilot_id, enemy_unit_id);

    res.json({ ...result, xp_details: { xp, baseXp, multiplier, disparity } });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Objective XP ─────────────────────────────────────────────────────────────
router.post('/objective', requireRole('gm'), (req, res) => {
  const { pilot_id, objective_id, xp_override, session_id } = req.body;
  if (!pilot_id || !objective_id) {
    return res.status(400).json({ error: 'pilot_id and objective_id are required' });
  }

  const obj = db.prepare('SELECT * FROM session_objectives WHERE id = ?').get(objective_id);
  if (!obj) return res.status(404).json({ error: 'Objective not found' });

  const amount = xp_override ?? obj.xp_reward;
  const notes  = `Objective: ${obj.description}`;

  // Mark objective complete
  db.prepare(`
    UPDATE session_objectives
    SET completed = 1, completed_by_pilot_id = ?, completed_at = datetime('now')
    WHERE id = ?
  `).run(pilot_id, objective_id);

  try {
    const result = awardXpToPilot(
      pilot_id, amount,
      obj.objective_type === 'hold' ? 'objective_hold' : 'objective_action',
      notes, session_id, req.user.id
    );
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── XP log for a pilot ───────────────────────────────────────────────────────
router.get('/pilot/:pilotId', (req, res) => {
  const pilot = db.prepare('SELECT * FROM pilots WHERE id = ?').get(req.params.pilotId);
  if (!pilot) return res.status(404).json({ error: 'Pilot not found' });

  const { role, player_id } = req.user;
  if (role === 'player' && pilot.player_id !== player_id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const log = db.prepare(`
    SELECT e.*, u.username AS awarded_by_username
    FROM xp_events e
    LEFT JOIN users u ON u.id = e.awarded_by
    WHERE e.pilot_id = ?
    ORDER BY e.occurred_at DESC
  `).all(req.params.pilotId);

  res.json(log);
});

module.exports = { router, awardXpToPilot };
