import { useState, useEffect } from 'react';
import { Coins, TrendingUp, TrendingDown, Plus, Minus } from 'lucide-react';
import { api } from '../api/client';
import toast from 'react-hot-toast';

const TYPE_LABELS = {
  deposit_manual:        'Manual Deposit',
  deposit_mission:       'Mission Payout',
  deposit_sale:          'Unit Sale',
  deposit_salvage_value: 'Salvage Credit',
  withdraw_manual:       'Manual Withdraw',
  withdraw_purchase:     'Unit Purchase',
  withdraw_repair:       'Repair Cost',
  withdraw_salvage_claim:'Salvage Claim',
};

const IS_DEBIT = (type) => type.startsWith('withdraw');

export default function Accounting() {
  const [balance,  setBalance]  = useState(0);
  const [entries,  setEntries]  = useState([]);
  const [total,    setTotal]    = useState(0);
  const [showDep,  setShowDep]  = useState(false);
  const [showWith, setShowWith] = useState(false);
  const [depForm,  setDepForm]  = useState({ amount: '', description: '' });
  const [witForm,  setWithForm] = useState({ amount: '', description: '' });

  const load = async () => {
    const [bal, led] = await Promise.all([
      api.accounting.balance().catch(() => ({ balance: 0 })),
      api.accounting.ledger({ limit: 100 }).catch(() => ({ entries: [], total: 0 })),
    ]);
    setBalance(bal.balance);
    setEntries(led.entries || []);
    setTotal(led.total || 0);
  };

  useEffect(() => { load(); }, []);

  const deposit = async (e) => {
    e.preventDefault();
    try {
      await api.accounting.deposit({ amount: parseInt(depForm.amount), description: depForm.description });
      toast.success(`${depForm.amount} pts deposited`);
      setDepForm({ amount: '', description: '' });
      setShowDep(false);
      load();
    } catch (err) { toast.error(err.message); }
  };

  const withdraw = async (e) => {
    e.preventDefault();
    try {
      await api.accounting.withdraw({ amount: parseInt(witForm.amount), description: witForm.description });
      toast.success(`${witForm.amount} pts withdrawn`);
      setWithForm({ amount: '', description: '' });
      setShowWith(false);
      load();
    } catch (err) { toast.error(err.message); }
  };

  // Running summary
  const totalIn  = entries.filter(e => !IS_DEBIT(e.type)).reduce((a, e) => a + e.amount, 0);
  const totalOut = entries.filter(e =>  IS_DEBIT(e.type)).reduce((a, e) => a + e.amount, 0);

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="flex items-center gap-2"><Coins className="w-6 h-6 text-yellow-400" /> Campaign Account</h1>

      {/* Balance card */}
      <div className="card bg-stone-800 border-amber-800 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-stone-400 text-sm">Current Balance</p>
            <p className="text-4xl font-bold text-amber-400 mt-1">{balance.toLocaleString()} pts</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowDep(v => !v)} className="btn-primary btn-sm"><Plus className="w-4 h-4" /> Deposit</button>
            <button onClick={() => setShowWith(v => !v)} className="btn-ghost btn-sm"><Minus className="w-4 h-4" /> Withdraw</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 border-t border-stone-700 pt-4">
          <div>
            <p className="text-xs text-stone-500">Total In (last {entries.length})</p>
            <p className="text-green-400 font-semibold">{totalIn.toLocaleString()} pts</p>
          </div>
          <div>
            <p className="text-xs text-stone-500">Total Out</p>
            <p className="text-red-400 font-semibold">{totalOut.toLocaleString()} pts</p>
          </div>
        </div>
      </div>

      {showDep && (
        <form onSubmit={deposit} className="card space-y-3 max-w-sm">
          <h3>Manual Deposit</h3>
          <div>
            <label className="label">Amount (pts)</label>
            <input type="number" min="1" className="input" value={depForm.amount} onChange={e => setDepForm(f => ({...f, amount: e.target.value}))} required />
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input" value={depForm.description} onChange={e => setDepForm(f => ({...f, description: e.target.value}))} required />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary">Deposit</button>
            <button type="button" onClick={() => setShowDep(false)} className="btn-ghost">Cancel</button>
          </div>
        </form>
      )}

      {showWith && (
        <form onSubmit={withdraw} className="card space-y-3 max-w-sm">
          <h3>Manual Withdrawal</h3>
          <div>
            <label className="label">Amount (pts)</label>
            <input type="number" min="1" className="input" value={witForm.amount} onChange={e => setWithForm(f => ({...f, amount: e.target.value}))} required />
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input" value={witForm.description} onChange={e => setWithForm(f => ({...f, description: e.target.value}))} required />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary">Withdraw</button>
            <button type="button" onClick={() => setShowWith(false)} className="btn-ghost">Cancel</button>
          </div>
        </form>
      )}

      {/* Ledger */}
      <div className="card space-y-3">
        <h3>Transaction Ledger <span className="text-stone-500 font-normal text-sm">({total} total)</span></h3>
        <div className="space-y-1 max-h-[28rem] overflow-y-auto">
          {entries.map(e => {
            const isDebit = IS_DEBIT(e.type);
            return (
              <div key={e.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-stone-700/40 border-b border-stone-700/40">
                <div className="flex items-center gap-3">
                  {isDebit
                    ? <TrendingDown className="w-4 h-4 text-red-400 flex-shrink-0" />
                    : <TrendingUp   className="w-4 h-4 text-green-400 flex-shrink-0" />
                  }
                  <div>
                    <p className="text-sm text-stone-200">{e.description}</p>
                    <p className="text-xs text-stone-500">
                      {TYPE_LABELS[e.type] || e.type}
                      {e.unit_name && ` · ${e.unit_name}`}
                      {e.created_by_username && ` · ${e.created_by_username}`}
                    </p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <p className={`font-semibold ${isDebit ? 'text-red-400' : 'text-green-400'}`}>
                    {isDebit ? '−' : '+'}{e.amount.toLocaleString()}
                  </p>
                  <p className="text-xs text-stone-500">→ {e.balance_after.toLocaleString()}</p>
                  <p className="text-xs text-stone-600">{new Date(e.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            );
          })}
          {entries.length === 0 && <p className="text-stone-500 text-sm text-center py-6">No transactions yet.</p>}
        </div>
      </div>
    </div>
  );
}
