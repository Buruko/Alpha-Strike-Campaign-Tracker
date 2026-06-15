import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Shield, User, DollarSign } from 'lucide-react';
import { api } from '../api/client';
import toast from 'react-hot-toast';

const UNIT_TYPES = ['BM','CV','CF','BA','CI'];
const TYPE_LABELS = { BM:'BattleMech', CV:'Vehicle', CF:'Aerospace', BA:'Battle Armor', CI:'Infantry' };

export default function UnitRoster() {
  const [units,   setUnits]   = useState([]);
  const [players, setPlayers] = useState([]);
  const [pilots,  setPilots]  = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showAssign, setShowAssign] = useState(null); // unit id
  const [assignPilotId, setAssignPilotId] = useState('');
  const [form, setForm] = useState({
    player_id: '', name: '', variant: '', unit_type: 'BM', size: 1,
    tonnage: '', base_pv: '', armor_max: '', structure_max: '',
    engine_hits_max: 2, fcu_hits_max: 4, mp_hits_max: 4, weapon_hits_max: 4,
    role: '', image_url: '',
  });

  const load = () => {
    api.units.list().then(setUnits).catch(() => {});
    api.get('/auth/me').then(d => {}).catch(() => {});
  };

  useEffect(() => {
    load();
    // Get all players via admin endpoint
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.json()).then(() => {}).catch(() => {});
    // Fetch players by getting pilots and extracting unique players
    api.pilots.list().then(list => {
      setPilots(list);
      const seen = new Set();
      const pl = [];
      list.forEach(p => {
        if (!seen.has(p.player_id)) {
          seen.add(p.player_id);
          pl.push({ id: p.player_id, callsign: p.player_callsign });
        }
      });
      setPlayers(pl);
    }).catch(() => {});
  }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.units.create({
        ...form,
        size:            parseInt(form.size),
        tonnage:         form.tonnage   ? parseInt(form.tonnage)   : undefined,
        base_pv:         parseInt(form.base_pv),
        armor_max:       parseInt(form.armor_max),
        structure_max:   parseInt(form.structure_max),
        engine_hits_max: parseInt(form.engine_hits_max),
        fcu_hits_max:    parseInt(form.fcu_hits_max),
        mp_hits_max:     parseInt(form.mp_hits_max),
        weapon_hits_max: parseInt(form.weapon_hits_max),
      });
      toast.success('Unit created — purchase cost debited from campaign account');
      setShowForm(false);
      load();
    } catch (err) { toast.error(err.message); }
  };

  const assign = async (unitId) => {
    if (!assignPilotId) return;
    try {
      await api.units.assignPilot(unitId, { pilot_id: assignPilotId });
      toast.success('Pilot assigned');
      setShowAssign(null);
      load();
    } catch (err) { toast.error(err.message); }
  };

  const unassign = async (unitId) => {
    try {
      await api.units.unassignPilot(unitId);
      toast.success('Pilot unassigned');
      load();
    } catch (err) { toast.error(err.message); }
  };

  const sell = async (unit) => {
    if (!confirm(`Sell ${unit.name}? This will retire the unit and credit the sale value to the campaign account.`)) return;
    try {
      const r = await api.accounting.sellUnit({ unit_id: unit.id });
      toast.success(`${unit.name} sold for ${r.final_price} pts`);
      load();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2"><Shield className="w-6 h-6 text-amber-400" /> Unit Roster</h1>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary btn-sm"><Plus className="w-4 h-4" /> Add Unit</button>
      </div>

      {showForm && (
        <form onSubmit={create} className="card space-y-4 max-w-2xl">
          <h3>Add Unit to Roster</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Player</label>
              <select className="input" value={form.player_id} onChange={e => setForm(f => ({...f, player_id: e.target.value}))} required>
                <option value="">Select player…</option>
                {players.map(p => <option key={p.id} value={p.id}>{p.callsign}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Unit Name</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} required />
            </div>
            <div>
              <label className="label">Variant</label>
              <input className="input" value={form.variant} onChange={e => setForm(f => ({...f, variant: e.target.value}))} />
            </div>
            <div>
              <label className="label">Type</label>
              <select className="input" value={form.unit_type} onChange={e => setForm(f => ({...f, unit_type: e.target.value}))}>
                {UNIT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Size</label>
              <input type="number" className="input" min="1" max="5" value={form.size} onChange={e => setForm(f => ({...f, size: e.target.value}))} />
            </div>
            <div>
              <label className="label">Base PV</label>
              <input type="number" className="input" value={form.base_pv} onChange={e => setForm(f => ({...f, base_pv: e.target.value}))} required />
            </div>
            <div>
              <label className="label">Tonnage</label>
              <input type="number" className="input" value={form.tonnage} onChange={e => setForm(f => ({...f, tonnage: e.target.value}))} />
            </div>
            <div>
              <label className="label">Armor Pips (max)</label>
              <input type="number" className="input" value={form.armor_max} onChange={e => setForm(f => ({...f, armor_max: e.target.value}))} required />
            </div>
            <div>
              <label className="label">Structure Pips (max)</label>
              <input type="number" className="input" value={form.structure_max} onChange={e => setForm(f => ({...f, structure_max: e.target.value}))} required />
            </div>
            <div>
              <label className="label">Engine Hit Slots</label>
              <input type="number" className="input" min="0" max="4" value={form.engine_hits_max} onChange={e => setForm(f => ({...f, engine_hits_max: e.target.value}))} />
            </div>
            <div>
              <label className="label">FCU Hit Slots</label>
              <input type="number" className="input" min="0" max="4" value={form.fcu_hits_max} onChange={e => setForm(f => ({...f, fcu_hits_max: e.target.value}))} />
            </div>
            <div>
              <label className="label">MP/Motive Slots</label>
              <input type="number" className="input" min="0" max="5" value={form.mp_hits_max} onChange={e => setForm(f => ({...f, mp_hits_max: e.target.value}))} />
            </div>
            <div>
              <label className="label">Weapon Hit Slots</label>
              <input type="number" className="input" min="0" max="4" value={form.weapon_hits_max} onChange={e => setForm(f => ({...f, weapon_hits_max: e.target.value}))} />
            </div>
            <div>
              <label className="label">Role</label>
              <input className="input" value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))} placeholder="Sniper, Brawler…" />
            </div>
            <div>
              <label className="label">Image URL</label>
              <input className="input" value={form.image_url} onChange={e => setForm(f => ({...f, image_url: e.target.value}))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary">Create Unit</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">Cancel</button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {units.map(unit => (
          <div key={unit.id} className="card space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <Link to={`/units/${unit.id}`} className="font-semibold text-stone-100 hover:text-amber-400">
                  {unit.name} {unit.variant && <span className="text-stone-400 font-normal">{unit.variant}</span>}
                </Link>
                <p className="text-xs text-stone-400 mt-0.5">
                  {unit.player_callsign} · {TYPE_LABELS[unit.unit_type]} sz{unit.size} · {unit.base_pv} PV
                  {unit.repair_cost_current > 0 && <span className="text-red-400 ml-2">⚠ {unit.repair_cost_current} pts damage</span>}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setShowAssign(unit.id); setAssignPilotId(''); }} className="btn-ghost btn-sm">
                  <User className="w-3 h-3" /> Assign Pilot
                </button>
                {unit.current_pilot && (
                  <button onClick={() => unassign(unit.id)} className="btn-ghost btn-sm text-stone-500">Unassign</button>
                )}
                <button onClick={() => sell(unit)} className="btn-ghost btn-sm text-green-400">
                  <DollarSign className="w-3 h-3" /> Sell
                </button>
              </div>
            </div>

            {unit.current_pilot && (
              <p className="text-xs text-blue-400">
                Pilot: {unit.current_pilot.name} (Skill {unit.current_pilot.skill})
              </p>
            )}

            {showAssign === unit.id && (
              <div className="flex gap-2 items-center bg-stone-700/50 rounded-lg p-3">
                <select className="input flex-1" value={assignPilotId} onChange={e => setAssignPilotId(e.target.value)}>
                  <option value="">Select pilot…</option>
                  {pilots.filter(p => p.player_id === unit.player_id)
                    .map(p => <option key={p.id} value={p.id}>{p.name} (Skill {p.skill})</option>)}
                </select>
                <button onClick={() => assign(unit.id)} className="btn-primary btn-sm">Assign</button>
                <button onClick={() => setShowAssign(null)} className="btn-ghost btn-sm">Cancel</button>
              </div>
            )}
          </div>
        ))}
        {units.length === 0 && <p className="text-stone-500 text-center py-8">No units in roster.</p>}
      </div>
    </div>
  );
}
