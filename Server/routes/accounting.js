/**
 * routes/accounting.js
 *
 * GET  /api/accounting/balance      — current campaign balance
 * GET  /api/accounting/ledger       — full ledger (QM/GM) or own transactions (player)
 * POST /api/accounting/deposit      — manual deposit (GM only)
 * POST /api/accounting/withdraw     — manual withdrawal (GM only)
 * POST /api/accounting/sell-unit    — sell unit, auto credit + accounting (QM/GM)
 */

const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../db/db');
const { verifyAuth } = require('../middleware/auth');
const { requireRole, requireMinRole } = require('../middleware/requireRole');
const { calcSaleValue } = require('../lib/repairCalculator');

router.use(verifyAuth);

function getBalance() {
  return db.prepare('SELECT balance FROM campaign_account WHERE id = 1').get()?.balance ?? 0;
}

function postLedgerEntry({ type, amount, description, unitId, sessionId, repairJobId, salvageId, createdBy }) {
  const isDebit = type.startsWith('withdraw');
  const current = getBalance();
  const newBalance = isDebit ? current - amount : current + amount;

  db.prepare('UPDATE campaign_account SET balance = ? WHERE id = 1').run(newBalance);

  db.prepare(`
    INSERT INTO account_ledger
      (id, type, amount, balance_after, description, unit_id, session_id, repair_job_id, salvage_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuid(), type, amount, newBalance, description,
    unitId ?? null, sessionId ?? null, repairJobId ?? null, salvageId ?? null, createdBy
  );

  return newBalance;
}

// ── Balance ──────────────────────────────────────────────────────────────────
router.get('/balance', (req, res) => {
  res.json({ balance: getBalance() });
});

// ── Ledger ───────────────────────────────────────────────────────────────────
router.get('/ledger', (req, res) => {
  const { role, player_id } = req.user;
  const { limit = 100, offset = 0, type } = req.query;

  let query = `
    SELECT al.*, u.username AS created_by_username,
           un.name AS unit_name
    FROM account_ledger al
    LEFT JOIN users u ON u.id = al.created_by
    LEFT JOIN units un ON un.id = al.unit_id
  `;
  const params = [];

  if (type) {
    query += ' WHERE al.type = ?';
    params.push(type);
  }

  query += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const entries = db.prepare(query).all(...params);
  const total   = db.prepare('SELECT COUNT(*) AS count FROM account_ledger').get().count;

  res.json({ entries, total, balance: getBalance() });
});

// ── Manual deposit (GM) ──────────────────────────────────────────────────────
router.post('/deposit', requireRole('gm'), (req, res) => {
  const { amount, description, session_id } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'amount must be positive' });
  if (!description) return res.status(400).json({ error: 'description is required' });

  const newBalance = postLedgerEntry({
    type:        'deposit_manual',
    amount,
    description,
    sessionId:   session_id ?? null,
    createdBy:   req.user.id,
  });

  res.json({ ok: true, balance: newBalance });
});

// ── Mission payout deposit (GM) ──────────────────────────────────────────────
router.post('/mission-payout', requireRole('gm'), (req, res) => {
  const { amount, description, session_id } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'amount must be positive' });

  const newBalance = postLedgerEntry({
    type:        'deposit_mission',
    amount,
    description: description ?? 'Mission payout',
    sessionId:   session_id ?? null,
    createdBy:   req.user.id,
  });

  res.json({ ok: true, balance: newBalance });
});

// ── Manual withdrawal (GM) ───────────────────────────────────────────────────
router.post('/withdraw', requireRole('gm'), (req, res) => {
  const { amount, description } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'amount must be positive' });
  if (!description) return res.status(400).json({ error: 'description is required' });

  const balance = getBalance();
  if (balance < amount) {
    return res.status(400).json({ error: `Insufficient funds. Balance: ${balance}` });
  }

  const newBalance = postLedgerEntry({
    type:      'withdraw_manual',
    amount,
    description,
    createdBy: req.user.id,
  });

  res.json({ ok: true, balance: newBalance });
});

// ── Sell unit (QM/GM) ────────────────────────────────────────────────────────
router.post('/sell-unit', requireMinRole('quartermaster'), (req, res) => {
  const { unit_id, override_price } = req.body;
  if (!unit_id) return res.status(400).json({ error: 'unit_id is required' });

  const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(unit_id);
  if (!unit) return res.status(404).json({ error: 'Unit not found' });
  if (unit.status === 'retired') return res.status(400).json({ error: 'Unit is already retired' });

  const { saleValue, breakdown } = calcSaleValue(unit);
  const finalPrice = override_price != null ? parseInt(override_price) : saleValue;

  db.transaction(() => {
    // Retire the unit
    db.prepare(`UPDATE units SET status = 'retired' WHERE id = ?`).run(unit_id);

    // Unassign any pilot
    db.prepare(`
      UPDATE pilot_unit_assignments SET unassigned_at = datetime('now')
      WHERE unit_id = ? AND unassigned_at IS NULL
    `).run(unit_id);

    // Credit account
    postLedgerEntry({
      type:        'deposit_sale',
      amount:      finalPrice,
      description: `Sold unit: ${unit.name}${override_price != null ? ' (GM override price)' : ''}`,
      unitId:      unit_id,
      createdBy:   req.user.id,
    });
  })();

  res.json({
    ok:           true,
    unit_id,
    calculated_sale_value: saleValue,
    final_price:  finalPrice,
    balance:      getBalance(),
    breakdown,
  });
});

module.exports = { router, postLedgerEntry };
