import { useState, useEffect } from 'react';
import { Wrench, CheckCircle, XCircle, Clock } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function RepairQueue() {
  const { isGM, isQM } = useAuth();
  const [jobs, setJobs]   = useState([]);
  const [units, setUnits] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]   = useState({
    unit_id: '', armor_restored: 0, structure_restored: 0,
    engine_restored: 0, fcu_restored: 0, mp_restored: 0, weapon_restored: 0, notes: '',
  });
  const [selectedUnit, setSelectedUnit] = useState(null);

  const load = () => {
    api.repairs.list().then(setJobs).catch(() => {});
    api.units.list().then(setUnits).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const selectUnit = (id) => {
    const u = units.find(u => u.id === id);
    setSelectedUnit(u || null);
    setForm(f => ({ ...f, unit_id: id,
      armor_restored: 0, structure_restored: 0, engine_restored: 0,
      fcu_restored: 0, mp_restored: 0, weapon_restored: 0,
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.repairs.create(form);
      toast.success('Repair job created');
      setShowForm(false);
      load();
    } catch (err) { toast.error(err.message); }
  };

  const approve  = async (id) => { try { await api.repairs.approve(id);  toast.success('Approved');  load(); } catch (e) { toast.error(e.message); } };
  const complete = async (id) => { try { await api.repairs.complete(id); toast.success('Complete'); load(); } catch (e) { toast.error(e.message); } };
  const cancel   = async (id) => { try { await api.repairs.cancel(id);   toast.success('Cancelled'); load(); } catch (e) { toast.error(e.message); } };

  const STATUS_ICON = {
    pending:   <Clock className="w-4 h-4 text-amber-400" />,
    approved:  <CheckCircle className="w-4 h-4 text-blue-400" />,
    complete:  <CheckCircle className="w-4 h-4 text-green-400" />,
    cancelled: <XCircle className="w-4 h-4 text-stone-500" />,
  };

  const pending  = jobs.filter(j => j.status === 'pending');
  const approved = jobs.filter(j => j.status === 'approved');
  const done     = jobs.filter(j => j.status === 'complete' || j.status === 'cancelled');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2"><Wrench className="w-6 h-6 text-green-400" /> Repair Queue</h1>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary btn-sm">+ New Repair Job</button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="card space-y-4 max-w-lg">
          <h3>Create Repair Job</h3>
          <div>
            <label className="label">Unit</label>
            <select className="input" value={form.unit_id} onChange={e => selectUnit(e.target.value)} required>
              <option value="">Select unit…</option>
              {units.filter(u => (u.armor_dmg + u.structure_dmg + u.engine_dmg + u.fcu_dmg + u.mp_dmg + u.weapon_dmg) > 0)
                .map(u => <option key={u.id} value={u.id}>{u.name} ({u.player_callsign})</option>)}
            </select>
          </div>

          {selectedUnit && (
            <div className="space-y-3 bg-stone-700/40 rounded-lg p-4">
              <p className="text-xs text-stone-400 uppercase tracking-wide">Damage to repair</p>
              {[
                { field: 'armor_restored',     label: 'Armor',     max: selectedUnit.armor_dmg },
                { field: 'structure_restored', label: 'Structure', max: selectedUnit.structure_dmg },
                { field: 'engine_restored',    label: 'Engine',    max: selectedUnit.engine_dmg },
                { field: 'fcu_restored',       label: 'Fire Con',  max: selectedUnit.fcu_dmg },
                { field: 'mp_restored',        label: 'MP/Motive', max: selectedUnit.mp_dmg },
                { field: 'weapon_restored',    label: 'Weapons',   max: selectedUnit.weapon_dmg },
              ].filter(f => f.max > 0).map(({ field, label, max }) => (
                <div key={field} className="flex items-center gap-3">
                  <label className="text-sm text-stone-300 w-24">{label} <span className="text-stone-500">({max} dmg)</span></label>
                  <input type="number" min="0" max={max} className="input w-24"
                    value={form[field]}
                    onChange={e => setForm(f => ({ ...f, [field]: parseInt(e.target.value) || 0 }))} />
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="label">Notes</label>
            <input className="input" value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary">Submit Job</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">Cancel</button>
          </div>
        </form>
      )}

      {/* Pending */}
      {pending.length > 0 && (
        <Section title="Pending Approval" jobs={pending} icon={STATUS_ICON.pending}
          renderActions={job => (
            <div className="flex gap-2">
              {(isGM || isQM) && <button onClick={() => approve(job.id)} className="btn-primary btn-sm">Approve</button>}
              {isGM && <button onClick={() => cancel(job.id)} className="btn-danger btn-sm">Cancel</button>}
            </div>
          )}
        />
      )}

      {/* Approved */}
      {approved.length > 0 && (
        <Section title="Approved — Ready to Complete" jobs={approved} icon={STATUS_ICON.approved}
          renderActions={job => (
            <div className="flex gap-2">
              <button onClick={() => complete(job.id)} className="btn-primary btn-sm">Mark Complete</button>
              {isGM && <button onClick={() => cancel(job.id)} className="btn-danger btn-sm">Cancel</button>}
            </div>
          )}
        />
      )}

      {/* Done */}
      {done.length > 0 && (
        <Section title="Completed / Cancelled" jobs={done} icon={null} renderActions={() => null} muted />
      )}

      {jobs.length === 0 && <p className="text-stone-500 text-center py-8">No repair jobs.</p>}
    </div>
  );
}

function Section({ title, jobs, icon, renderActions, muted = false }) {
  return (
    <div className="space-y-2">
      <h3 className={muted ? 'text-stone-500' : ''}>{title}</h3>
      {jobs.map(job => (
        <div key={job.id} className={`card flex items-center justify-between gap-4 ${muted ? 'opacity-60' : ''}`}>
          <div className="flex items-center gap-3">
            {icon}
            <div>
              <p className="font-medium">{job.unit_name}</p>
              <p className="text-xs text-stone-400">
                {job.player_callsign}
                {job.tech_username && ` · Tech: ${job.tech_username}`}
                {job.notes && ` · ${job.notes}`}
              </p>
              <div className="flex gap-3 mt-1 text-xs text-stone-500">
                {job.armor_restored     > 0 && <span>Armor ×{job.armor_restored}</span>}
                {job.structure_restored > 0 && <span>Structure ×{job.structure_restored}</span>}
                {job.engine_restored    > 0 && <span>Engine ×{job.engine_restored}</span>}
                {job.fcu_restored       > 0 && <span>FCU ×{job.fcu_restored}</span>}
                {job.mp_restored        > 0 && <span>MP ×{job.mp_restored}</span>}
                {job.weapon_restored    > 0 && <span>Weapons ×{job.weapon_restored}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            <span className="text-amber-400 font-semibold">{job.repair_cost} pts</span>
            {renderActions(job)}
          </div>
        </div>
      ))}
    </div>
  );
}
