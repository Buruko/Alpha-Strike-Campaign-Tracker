import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Package, ChevronLeft, CheckCircle, X } from 'lucide-react';
import { api } from '../api/client';
import toast from 'react-hot-toast';

export default function Salvage() {
  const { sessionId } = useParams();
  const [items,   setItems]   = useState([]);
  const [players, setPlayers] = useState([]);
  const [claimFor, setClaimFor] = useState({});
  const [built,   setBuilt]   = useState(false);

  const load = async () => {
    const [itemList, pilotList] = await Promise.all([
      api.salvage.list(sessionId).catch(() => []),
      api.pilots.list().catch(() => []),
    ]);
    setItems(itemList);
    // Extract unique players from pilots
    const seen = new Set();
    const pl = [];
    pilotList.forEach(p => {
      if (!seen.has(p.player_id)) {
        seen.add(p.player_id);
        pl.push({ id: p.player_id, callsign: p.player_callsign });
      }
    });
    setPlayers(pl);
    setBuilt(itemList.length > 0);
  };

  useEffect(() => { load(); }, [sessionId]);

  const build = async () => {
    try {
      const r = await api.salvage.build(sessionId);
      toast.success(`${r.built} salvage items queued`);
      load();
    } catch (e) { toast.error(e.message); }
  };

  const claim = async (item) => {
    const pid = claimFor[item.id];
    if (!pid) { toast.error('Select a player first'); return; }
    try {
      const r = await api.salvage.claim(item.id, { player_id: pid });
      toast.success(`Claimed! Salvage value ${r.salvage_value} pts credited`);
      load();
    } catch (e) { toast.error(e.message); }
  };

  const dismiss = async (item) => {
    try {
      await api.salvage.dismiss(item.id);
      load();
    } catch (e) { toast.error(e.message); }
  };

  const pending   = items.filter(i => i.status === 'pending');
  const claimed   = items.filter(i => i.status === 'claimed');
  const dismissed = items.filter(i => i.status === 'dismissed');

  const TYPE_LABELS = { BM:'BattleMech', CV:'Vehicle', CF:'Aerospace', BA:'Battle Armor', CI:'Infantry' };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link to={`/contracts/sessions/${sessionId}`} className="text-stone-400 hover:text-stone-200">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="flex items-center gap-2"><Package className="w-6 h-6 text-amber-400" /> Salvage Review</h1>
      </div>

      {!built && (
        <div className="card text-center space-y-3">
          <p className="text-stone-400">Build the salvage queue from this session's enemy units.</p>
          <button onClick={build} className="btn-primary">Build Salvage Queue</button>
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-3">
          <h3>Available Salvage ({pending.length})</h3>
          {pending.map(item => (
            <div key={item.id} className="card space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{item.unit_name}</span>
                    {item.variant && <span className="text-stone-500 text-xs">{item.variant}</span>}
                    <span className="badge badge-stone">{item.unit_status}</span>
                  </div>
                  <p className="text-xs text-stone-400 mt-1">
                    {TYPE_LABELS[item.unit_type] || item.unit_type} · Size {item.size} · Base PV: {item.base_pv}
                    {item.group_name && ` · ${item.group_name}`}
                  </p>
                  {item.kill_pilot_name && (
                    <p className="text-xs text-red-400 mt-0.5">Killed by: {item.kill_pilot_name}</p>
                  )}
                </div>
                <div className="text-right space-y-1">
                  <p className="text-xs text-stone-500">Repair Cost</p>
                  <p className="text-red-400 font-semibold">{item.repair_cost} pts</p>
                  <p className="text-xs text-stone-500">Salvage Value</p>
                  <p className="text-green-400 font-semibold">{item.salvage_value} pts</p>
                </div>
              </div>

              {/* Damage breakdown */}
              <div className="grid grid-cols-3 gap-2 text-xs text-stone-500 bg-stone-700/30 rounded-lg p-3">
                <span>Armor: {item.armor_dmg}/{item.armor_max} dmg</span>
                <span>Structure: {item.structure_dmg}/{item.structure_max} dmg</span>
                <span>Engine: {item.engine_dmg} hits</span>
                <span>FCU: {item.fcu_dmg} hits</span>
                <span>MP: {item.mp_dmg} hits</span>
                <span>Weapons: {item.weapon_dmg} hits</span>
              </div>

              <div className="flex items-center gap-3">
                <select className="input flex-1"
                  value={claimFor[item.id] || ''}
                  onChange={e => setClaimFor(prev => ({ ...prev, [item.id]: e.target.value }))}>
                  <option value="">Assign to player…</option>
                  {players.map(p => <option key={p.id} value={p.id}>{p.callsign}</option>)}
                </select>
                <button onClick={() => claim(item)} disabled={!claimFor[item.id]} className="btn-primary btn-sm">
                  <CheckCircle className="w-4 h-4" /> Claim
                </button>
                <button onClick={() => dismiss(item)} className="btn-ghost btn-sm text-stone-500">
                  <X className="w-4 h-4" /> Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {claimed.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-stone-500">Claimed ({claimed.length})</h3>
          {claimed.map(item => (
            <div key={item.id} className="card opacity-60 flex items-center justify-between">
              <span className="font-medium">{item.unit_name}</span>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-stone-400">→ {item.claimed_by_callsign}</span>
                <span className="text-green-400">{item.salvage_value} pts credited</span>
                <CheckCircle className="w-4 h-4 text-green-400" />
              </div>
            </div>
          ))}
        </div>
      )}

      {dismissed.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-stone-500">Dismissed ({dismissed.length})</h3>
          {dismissed.map(item => (
            <div key={item.id} className="card opacity-40 flex items-center justify-between">
              <span className="font-medium">{item.unit_name}</span>
              <span className="text-stone-500 text-sm">Dismissed</span>
            </div>
          ))}
        </div>
      )}

      {items.length === 0 && built && (
        <p className="text-stone-500 text-center py-8">No salvageable units found for this session.</p>
      )}
    </div>
  );
}
