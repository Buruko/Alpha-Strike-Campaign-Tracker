// ─── MyPilots.jsx ─────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, TrendingUp, Award } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export function MyPilots() {
  const { isGM, player } = useAuth();
  const [pilots, setPilots] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', skill: 4 });

  useEffect(() => { api.pilots.list().then(setPilots).catch(() => {}); }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      const p = await api.pilots.create({ ...form, player_id: player?.id });
      setPilots(prev => [...prev, p]);
      setForm({ name: '', skill: 4 });
      setShowForm(false);
      toast.success('Pilot created');
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1>Pilots</h1>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary btn-sm">
          <Plus className="w-4 h-4" /> New Pilot
        </button>
      </div>

      {showForm && (
        <form onSubmit={create} className="card space-y-4 max-w-md">
          <h3>Create Pilot</h3>
          <div>
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} required />
          </div>
          <div>
            <label className="label">Starting Skill (lower = better)</label>
            <input type="number" className="input" min="1" max="8" value={form.skill}
              onChange={e => setForm(f => ({...f, skill: parseInt(e.target.value)}))} />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary">Create</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">Cancel</button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {pilots.map(p => (
          <Link key={p.id} to={`/pilots/${p.id}`}
            className="card hover:bg-stone-700/80 transition-colors flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-stone-100">{p.name}</span>
                {p.rank_up_pending === 1 && <span className="badge badge-amber">Promotion!</span>}
              </div>
              <div className="text-sm text-stone-400 mt-1">
                {p.player_callsign} · Rank {p.rank} · Skill {p.skill}
                {p.current_unit && <span> · {p.current_unit.name}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              <span className="text-amber-400 font-semibold">{p.xp_total} XP</span>
              <span className="text-stone-500 text-xs">
                {p.psa_slots_used}/{p.psa_slots_available} PSA
              </span>
            </div>
          </Link>
        ))}
        {pilots.length === 0 && <p className="text-stone-500 text-sm text-center py-8">No pilots yet.</p>}
      </div>
    </div>
  );
}
export default MyPilots;
