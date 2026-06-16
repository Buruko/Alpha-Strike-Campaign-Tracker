import { v4 as uuid } from 'uuid';
import { getDb } from '../db/db.js';
import { verifyAuth, requireMinRole } from '../middleware/auth.js';
import { ok, err } from '../lib/response.js';
import { calcSaleValue } from '../lib/repairCalculator.js';

export async function postLedgerEntry(db, { type, amount, description, unitId, sessionId, repairJobId, salvageId, createdBy }) {
  const acct   = await db.get('SELECT balance FROM campaign_account WHERE id=1');
  const cur    = acct?.balance ?? 0;
  const newBal = type.startsWith('withdraw') ? cur - amount : cur + amount;
  await db.batch([
    { sql: 'UPDATE campaign_account SET balance=? WHERE id=1', params: [newBal] },
    { sql: 'INSERT INTO account_ledger (id,type,amount,balance_after,description,unit_id,session_id,repair_job_id,salvage_id,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)',
      params: [uuid(), type, amount, newBal, description, unitId??null, sessionId??null, repairJobId??null, salvageId??null, createdBy] },
  ]);
  return newBal;
}

export function accountingRoutes(router) {

  router.get('/api/accounting/balance', verifyAuth, async (request, env) => {
    const db   = getDb(env);
    const acct = await db.get('SELECT balance FROM campaign_account WHERE id=1');
    return ok({ balance: acct?.balance ?? 0 });
  });

  router.get('/api/accounting/ledger', requireMinRole('quartermaster'), async (request, env) => {
    const db     = getDb(env);
    const url    = new URL(request.url);
    const limit  = parseInt(url.searchParams.get('limit')  ?? '100');
    const offset = parseInt(url.searchParams.get('offset') ?? '0');
    const type   = url.searchParams.get('type');
    let q      = `SELECT al.*,u.username AS created_by_username,un.name AS unit_name FROM account_ledger al LEFT JOIN users u ON u.id=al.created_by LEFT JOIN units un ON un.id=al.unit_id`;
    const params = [];
    if (type) { q += ' WHERE al.type=?'; params.push(type); }
    q += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const [entries, countRow, acct] = await Promise.all([
      db.all(q, params),
      db.get('SELECT COUNT(*) AS count FROM account_ledger'),
      db.get('SELECT balance FROM campaign_account WHERE id=1'),
    ]);
    return ok({ entries, total: countRow?.count ?? 0, balance: acct?.balance ?? 0 });
  });

  router.post('/api/accounting/deposit', requireMinRole('gm'), async (request, env) => {
    const db   = getDb(env);
    const { amount, description, session_id } = await request.json().catch(() => ({}));
    if (!amount || amount <= 0) return err('amount must be positive', 400);
    if (!description) return err('description required', 400);
    const bal = await postLedgerEntry(db, { type:'deposit_manual', amount, description, sessionId:session_id??null, createdBy:request.user.id });
    return ok({ ok:true, balance:bal });
  });

  router.post('/api/accounting/mission-payout', requireMinRole('gm'), async (request, env) => {
    const db   = getDb(env);
    const { amount, description, session_id } = await request.json().catch(() => ({}));
    if (!amount || amount <= 0) return err('amount must be positive', 400);
    const bal = await postLedgerEntry(db, { type:'deposit_mission', amount, description:description??'Mission payout', sessionId:session_id??null, createdBy:request.user.id });
    return ok({ ok:true, balance:bal });
  });

  router.post('/api/accounting/withdraw', requireMinRole('gm'), async (request, env) => {
    const db   = getDb(env);
    const { amount, description } = await request.json().catch(() => ({}));
    if (!amount || amount <= 0) return err('amount must be positive', 400);
    if (!description) return err('description required', 400);
    const acct = await db.get('SELECT balance FROM campaign_account WHERE id=1');
    if ((acct?.balance ?? 0) < amount) return err(`Insufficient funds. Balance: ${acct?.balance ?? 0}`, 400);
    const bal = await postLedgerEntry(db, { type:'withdraw_manual', amount, description, createdBy:request.user.id });
    return ok({ ok:true, balance:bal });
  });

  router.post('/api/accounting/sell-unit', requireMinRole('quartermaster'), async (request, env) => {
    const db   = getDb(env);
    const { unit_id, override_price } = await request.json().catch(() => ({}));
    if (!unit_id) return err('unit_id required', 400);
    const unit = await db.get('SELECT * FROM units WHERE id=?', [unit_id]);
    if (!unit) return err('Unit not found', 404);
    if (unit.status === 'retired') return err('Unit is already retired', 400);
    const { saleValue, breakdown } = calcSaleValue(unit);
    const finalPrice = override_price != null ? parseInt(override_price) : saleValue;
    await db.batch([
      { sql: "UPDATE units SET status='retired' WHERE id=?", params: [unit_id] },
      { sql: "UPDATE pilot_unit_assignments SET unassigned_at=datetime('now') WHERE unit_id=? AND unassigned_at IS NULL", params: [unit_id] },
    ]);
    const bal = await postLedgerEntry(db, { type:'deposit_sale', amount:finalPrice, description:`Sold unit: ${unit.name}`, unitId:unit_id, createdBy:request.user.id });
    return ok({ ok:true, unit_id, calculated_sale_value:saleValue, final_price:finalPrice, balance:bal, breakdown });
  });
}
