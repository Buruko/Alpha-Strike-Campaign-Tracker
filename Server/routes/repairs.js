/**
 * routes/repairs.js
 *
 * GET    /api/repairs                — list repair jobs (filtered by role)
 * GET    /api/repairs/:id            — repair job detail
 * POST   /api/repairs                — technician/GM creates repair job
 * PATCH  /api/repairs/:id/approve    — GM/QM approves repair job
 * PATCH  /api/repairs/:id/complete   — technician/GM completes repair, applies to unit, debits account
 * PATCH  /api/repairs/:id/cancel     — GM cancels repair job
 */

const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../db/db');
const { verifyAuth } = require('../middleware/auth');
const { requireMinRole, requireRole } = require('../middleware/requireRole');
const { calcRepairCost, calcCostPerPip } = require('../lib/repairCalculator');

router.use(verifyAuth);

function getAccountBalance() {
  return db.prepare('SELECT balance FROM campaign_account WHERE id = 1').get()?.balance ?? 0;
}

function postLedger({ type, amount, balanceAfter, description, unitId, repairJobId, createdBy }) {
  db.prepare(`
    INSERT INTO account_ledger
      (id, type, amount, balance_after, description, unit_id, repair_job_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuid(), type, amount, balanceAfter, description, unitId ?? null, repairJobId ?? null, createdBy);
}

// ── List repair jobs ─────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { role, player_id } = req.user;

  let jobs;
  if (role === 'player') {
    jobs = db.prepare(`
      SELECT rj.*, u.name AS unit_name, pl.callsign AS player_callsign
      FROM repair_jobs rj
      JOIN units u ON u.id = rj.unit_id
      JOIN players pl ON pl.id = u.player_id
      WHERE pl.id = ?
      ORDER BY rj.created_at DESC
    `).all(player_id);
  } else {
    jobs = db.prepare(`
      SELECT rj.*, u.name AS unit_name, pl.callsign AS player_callsign,
             tech.username AS tech_username
      FROM repair_jobs rj
      JOIN units u ON u.id = rj.unit_id
      JOIN players pl ON pl.id = u.player_id
      LEFT JOIN users tech ON tech.id = rj.technician_user_id
      ORDER BY rj.created_at DESC
    `).all();
  }

  res.json(jobs);
});

// ── Get repair job detail ─────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const job = db.prepare(`
    SELECT rj.*, u.name AS unit_name, u.base_pv, u.armor_max,
           pl.callsign AS player_callsign, pl.id AS player_id,
           tech.username AS tech_username
    FROM repair_jobs rj
    JOIN units u ON u.id = rj.unit_id
    JOIN players pl ON pl.id = u.player_id
    LEFT JOIN users tech ON tech.id = rj.technician_user_id
    WHERE rj.id = ?
  `).get(req.params.id);

  if (!job) return res.status(404).json({ error: 'Repair job not found' });

  const { role, player_id } = req.user;
  if (role === 'player' && job.player_id !== player_id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  res.json(job);
});

// ── Create repair job ────────────────────────────────────────────────────────
router.post('/', requireMinRole('technician'), (req, res) => {
  const {
    unit_id,
    armor_restored, structure_restored, engine_restored,
    fcu_restored, mp_restored, weapon_restored,
    notes,
  } = req.body;

  if (!unit_id) return res.status(400).json({ error: 'unit_id is required' });

  const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(unit_id);
  if (!unit) return res.status(404).json({ error: 'Unit not found' });

  // Validate repair amounts don't exceed current damage
  const repairs = {
    armor:     parseInt(armor_restored     ?? 0),
    structure: parseInt(structure_restored ?? 0),
    engine:    parseInt(engine_restored    ?? 0),
    fcu:       parseInt(fcu_restored       ?? 0),
    mp:        parseInt(mp_restored        ?? 0),
    weapon:    parseInt(weapon_restored    ?? 0),
  };

  const errors = [];
  if (repairs.armor     > unit.armor_dmg)     errors.push(`armor_restored (${repairs.armor}) exceeds damage (${unit.armor_dmg})`);
  if (repairs.structure > unit.structure_dmg) errors.push(`structure_restored (${repairs.structure}) exceeds damage (${unit.structure_dmg})`);
  if (repairs.engine    > unit.engine_dmg)    errors.push(`engine_restored (${repairs.engine}) exceeds damage (${unit.engine_dmg})`);
  if (repairs.fcu       > unit.fcu_dmg)       errors.push(`fcu_restored (${repairs.fcu}) exceeds damage (${unit.fcu_dmg})`);
  if (repairs.mp        > unit.mp_dmg)        errors.push(`mp_restored (${repairs.mp}) exceeds damage (${unit.mp_dmg})`);
  if (repairs.weapon    > unit.weapon_dmg)    errors.push(`weapon_restored (${repairs.weapon}) exceeds damage (${unit.weapon_dmg})`);
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  // Calculate repair cost for this specific job
  const cpp = calcCostPerPip(unit.base_pv, unit.armor_max);
  const repairCost =
    (repairs.armor     * cpp.armor)     +
    (repairs.structure * cpp.structure) +
    (repairs.engine    * cpp.engine)    +
    (repairs.fcu       * cpp.fcu)       +
    (repairs.mp        * cpp.mp)        +
    (repairs.weapon    * cpp.weapon);

  const id = uuid();
  db.prepare(`
    INSERT INTO repair_jobs (
      id, unit_id, technician_user_id,
      armor_restored, structure_restored, engine_restored,
      fcu_restored, mp_restored, weapon_restored,
      repair_cost, notes, status
    ) VALUES (
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, 'pending'
    )
  `).run(
    id, unit_id, req.user.id,
    repairs.armor, repairs.structure, repairs.engine,
    repairs.fcu, repairs.mp, repairs.weapon,
    repairCost, notes ?? null
  );

  const job = db.prepare('SELECT * FROM repair_jobs WHERE id = ?').get(id);
  res.status(201).json(job);
});

// ── Approve repair job (QM / GM) ─────────────────────────────────────────────
router.patch('/:id/approve', requireMinRole('quartermaster'), (req, res) => {
  const job = db.prepare('SELECT * FROM repair_jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Repair job not found' });
  if (job.status !== 'pending') {
    return res.status(400).json({ error: `Cannot approve a job with status: ${job.status}` });
  }

  const balance = getAccountBalance();
  if (balance < job.repair_cost) {
    return res.status(400).json({
      error: `Insufficient funds. Balance: ${balance}, Repair cost: ${job.repair_cost}`,
    });
  }

  db.prepare(`
    UPDATE repair_jobs SET status = 'approved', approved_by = ? WHERE id = ?
  `).run(req.user.id, job.id);

  res.json(db.prepare('SELECT * FROM repair_jobs WHERE id = ?').get(job.id));
});

// ── Complete repair job ───────────────────────────────────────────────────────
router.patch('/:id/complete', requireMinRole('technician'), (req, res) => {
  const job = db.prepare('SELECT * FROM repair_jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Repair job not found' });
  if (job.status !== 'approved') {
    return res.status(400).json({ error: `Job must be approved before completing. Status: ${job.status}` });
  }

  const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(job.unit_id);
  if (!unit) return res.status(404).json({ error: 'Unit not found' });

  db.transaction(() => {
    // Apply repairs to unit
    db.prepare(`
      UPDATE units SET
        armor_dmg     = MAX(0, armor_dmg     - ?),
        structure_dmg = MAX(0, structure_dmg - ?),
        engine_dmg    = MAX(0, engine_dmg    - ?),
        fcu_dmg       = MAX(0, fcu_dmg       - ?),
        mp_dmg        = MAX(0, mp_dmg        - ?),
        weapon_dmg    = MAX(0, weapon_dmg    - ?)
      WHERE id = ?
    `).run(
      job.armor_restored, job.structure_restored, job.engine_restored,
      job.fcu_restored, job.mp_restored, job.weapon_restored,
      unit.id
    );

    // Debit campaign account
    const balance    = getAccountBalance();
    const newBalance = balance - job.repair_cost;
    db.prepare('UPDATE campaign_account SET balance = ? WHERE id = 1').run(newBalance);
    postLedger({
      type:         'withdraw_repair',
      amount:       job.repair_cost,
      balanceAfter: newBalance,
      description:  `Repair: ${unit.name}`,
      unitId:       unit.id,
      repairJobId:  job.id,
      createdBy:    req.user.id,
    });

    // Mark job complete
    db.prepare(`
      UPDATE repair_jobs SET status = 'complete', completed_at = datetime('now') WHERE id = ?
    `).run(job.id);

    // Create notification for unit owner
    const owner = db.prepare(`
      SELECT u.id FROM users u JOIN players pl ON pl.user_id = u.id WHERE pl.id = ?
    `).get(unit.player_id);
    if (owner) {
      db.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body)
        VALUES (?, ?, 'repair_complete', ?, ?)
      `).run(
        uuid(), owner.id,
        `${unit.name} repairs complete`,
        `Repair job finished. Cost: ${job.repair_cost} pts deducted from campaign account.`
      );
    }
  })();

  res.json(db.prepare('SELECT * FROM repair_jobs WHERE id = ?').get(job.id));
});

// ── Cancel repair job (GM only) ──────────────────────────────────────────────
router.patch('/:id/cancel', requireRole('gm'), (req, res) => {
  const job = db.prepare('SELECT * FROM repair_jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Repair job not found' });
  if (job.status === 'complete') {
    return res.status(400).json({ error: 'Cannot cancel a completed repair job' });
  }
  db.prepare(`UPDATE repair_jobs SET status = 'cancelled' WHERE id = ?`).run(job.id);
  res.json({ ok: true });
});

module.exports = router;
