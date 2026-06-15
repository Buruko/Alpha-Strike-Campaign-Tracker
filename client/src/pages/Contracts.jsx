import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Sword, ChevronRight } from 'lucide-react';
import { api } from '../api/client';
import toast from 'react-hot-toast';

export default function Contracts() {
  const [contracts, setContracts] = useState([]);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState({ name: '', description: '' });

  const load = () => api.contracts.list().then(setContracts).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.contracts.create(form);
      toast.success('Contract created');
      setShowForm(false);
      setForm({ name: '', description: '' });
      load();
    } catch (err) { toast.error(err.message); }
  };

  const close = async (id, status) => {
    try {
      await api.contracts.update(id, { status });
      toast.success(`Contract ${status}`);
      load();
    } catch (err) { toast.error(err.message); }
  };

  const STATUS_BADGE = {
    active:    'badge-green',
    complete:  'badge-blue',
    abandoned: 'badge-stone',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2"><Sword className="w-6 h-6 text-amber-400" /> Contracts</h1>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary btn-sm"><Plus className="w-4 h-4" /> New Contract</button>
      </div>

      {showForm && (
        <form onSubmit={create} className="card space-y-4 max-w-lg">
          <h3>New Contract</h3>
          <div>
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} required />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input" rows={3} value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary">Create</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">Cancel</button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {contracts.map(c => (
          <div key={c.id} className="card space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{c.name}</span>
                  <span className={`badge ${STATUS_BADGE[c.status]}`}>{c.status}</span>
                </div>
                {c.description && <p className="text-sm text-stone-400 mt-1">{c.description}</p>}
                <p className="text-xs text-stone-500 mt-1">{c.session_count} sessions</p>
              </div>
              <div className="flex gap-2">
                {c.status === 'active' && (
                  <>
                    <button onClick={() => close(c.id, 'complete')} className="btn-ghost btn-sm">Complete</button>
                    <button onClick={() => close(c.id, 'abandoned')} className="btn-ghost btn-sm text-stone-500">Abandon</button>
                  </>
                )}
              </div>
            </div>
            <Link to={`/contracts/${c.id}/sessions`} className="flex items-center gap-1 text-sm text-amber-400 hover:text-amber-300">
              View sessions <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        ))}
        {contracts.length === 0 && <p className="text-stone-500 text-center py-8">No contracts yet.</p>}
      </div>
    </div>
  );
}
