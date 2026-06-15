import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, Wrench, DollarSign } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import DamageTracker from '../components/units/DamageTracker';
import toast from 'react-hot-toast';

export default function UnitDetail() {
  const { id } = useParams();
  const { isGM, isQM, canRepair } = useAuth();
  const [unit, setUnit]     = useState(null);
  const [saleVal, setSaleVal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  const load = async () => {
    try {
      const u = await api.units.get(id);
      setUnit(u);
    } catch { toast.error('Unit not found'); }
    finally   { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const applyDamage = async (updates) => {
    setSaving(true);
    try {
      const updated = await api.units.applyDamage(id, updates);
      setUnit(updated);
    } catch (e) { toast.error(e.message); }
    finally     { setSaving(false); }
  };

  const loadSaleValue = async () => {
    try {
      const sv = await api.units.saleValue(id);
      setSaleVal(sv);
    } catch (e) { toast.error(e.message); }
  };

  const TYPE_LABELS = { BM:'BattleMech', CV:'Vehicle', CF:'Aerospace', BA:'Battle Armor', CI:'Infantry' };

  if (loading) return <div className="text-stone-400 py-12 text-center">Loading…</div>;
  if (!unit)   return <div className="text-red-400 py-12 text-center">Unit not found</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link to="/units" className="text-stone-400 hover:text-stone-200"><ChevronLeft className="w-5 h-5" /></Link>
        <div>
          <h1>{unit.name} {unit.variant && <span className="text-stone-400 font-normal text-lg">{unit.variant}</span>}</h1>
          <p className="text-stone-400 text-sm">
            {TYPE_LABELS[unit.unit_type] || unit.unit_type} · Size {unit.size} · {unit.base_pv} PV base
            {unit.tonnage && ` · ${unit.tonnage}t`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Damage tracking */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3>Damage State</h3>
            {saving && <span className="text-xs text-stone-500">Saving…</span>}
          </div>
          <DamageTracker unit={unit} onChange={applyDamage} />
        </div>

        {/* Unit info */}
        <div className="space-y-4">
          <div className="card space-y-3">
            <h3>Unit Info</h3>
            <div className="space-y-2 text-sm">
              <Row label="Owner"     value={unit.player_callsign} />
              <Row label="Role"      value={unit.role || '—'} />
              <Row label="TMM"       value={unit.tmm ?? 0} />
              <Row label="Base PV"   value={`${unit.base_pv} pts`} />
              <Row label="Status"    value={<span className="capitalize badge badge-stone">{unit.status}</span>} />
            </div>

            {unit.abilities?.length > 0 && (
              <div className="pt-2 border-t border-stone-700">
                <p className="text-xs text-stone-500 mb-2">Abilities</p>
                <div className="flex flex-wrap gap-1">
                  {unit.abilities.map(a => (
                    <span key={a} className="badge badge-stone text-xs">{a}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Assigned pilot */}
          <div className="card space-y-2">
            <h3>Pilot</h3>
            {unit.current_pilot ? (
              <Link to={`/pilots/${unit.current_pilot.id}`}
                className="block p-3 bg-stone-700/50 rounded-lg hover:bg-stone-700">
                <p className="font-medium">{unit.current_pilot.name}</p>
                <p className="text-xs text-stone-400 mt-1">Skill {unit.current_pilot.skill} · Rank {unit.current_pilot.rank}</p>
              </Link>
            ) : (
              <p className="text-stone-500 text-sm">No pilot assigned</p>
            )}
          </div>

          {/* Sale value */}
          {(isGM || isQM) && (
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-green-400" /> Sale Value
                </h3>
                <button onClick={loadSaleValue} className="btn-ghost btn-sm">Calculate</button>
              </div>
              {saleVal && (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between font-semibold">
                    <span className="text-stone-300">Calculated Sale Value</span>
                    <span className="text-green-400">{saleVal.saleValue} pts</span>
                  </div>
                  <div className="text-xs text-stone-500 space-y-1 border-t border-stone-700 pt-2">
                    <div className="flex justify-between"><span>Parts Percentage</span><span>{(saleVal.partsPct * 100).toFixed(2)}%</span></div>
                    <div className="flex justify-between"><span>Full Repair Cost</span><span>{saleVal.fullRepairCost} pts</span></div>
                    {Object.entries(saleVal.breakdown).map(([type, b]) => b.damagedPips > 0 && (
                      <div key={type} className="flex justify-between text-red-400/70">
                        <span className="capitalize">{type} dmg ({b.damagedPips} pips)</span>
                        <span>−{Math.round(b.damagedPips * b.partValue)} pts</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Repair history */}
      {unit.repair_history?.length > 0 && (
        <div className="card space-y-3">
          <h3 className="flex items-center gap-2"><Wrench className="w-4 h-4 text-green-400" /> Repair History</h3>
          <div className="space-y-2">
            {unit.repair_history.map(r => (
              <div key={r.id} className="flex items-center justify-between text-sm p-2 bg-stone-700/40 rounded-lg">
                <div>
                  <span className="text-stone-300">{r.tech_username || 'Unknown tech'}</span>
                  {r.notes && <span className="text-stone-500 ml-2 text-xs">{r.notes}</span>}
                </div>
                <div className="text-right">
                  <span className={`badge ${r.status === 'complete' ? 'badge-green' : r.status === 'pending' ? 'badge-amber' : 'badge-stone'}`}>
                    {r.status}
                  </span>
                  <span className="text-amber-400 ml-2">{r.repair_cost} pts</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-stone-500">{label}</span>
      <span className="text-stone-200">{value}</span>
    </div>
  );
}
