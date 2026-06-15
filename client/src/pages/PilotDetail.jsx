import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Award, TrendingUp, Shield, ChevronLeft } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import PSAModal from '../components/pilots/PSAModal';
import toast from 'react-hot-toast';

const RANK_NAMES = { 0:'Starting Pilot', 1:'Rank I', 2:'Rank II', 3:'Rank III', 4:'Rank IV' };
const XP_TYPE_LABELS = {
  damage_tac: 'TAC Damage', damage_critical: 'Critical Hit', damage_melee: 'Melee',
  kill: 'Kill', objective_hold: 'Objective Hold', objective_action: 'Objective', manual: 'Manual Award',
};

export default function PilotDetail() {
  const { id }   = useParams();
  const { isGM } = useAuth();
  const [pilot, setPilot]       = useState(null);
  const [showPSA, setShowPSA]   = useState(false);
  const [loading, setLoading]   = useState(true);

  const load = async () => {
    try {
      const data = await api.pilots.get(id);
      setPilot(data);
      if (data.rank_up_pending) setShowPSA(true);
    } catch { toast.error('Failed to load pilot'); }
    finally  { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  if (loading) return <div className="text-stone-400 py-12 text-center">Loading…</div>;
  if (!pilot)  return <div className="text-red-400 py-12 text-center">Pilot not found</div>;

  const nextRank = pilot.next_rank_def;
  const xpToNext = nextRank ? nextRank.xp_required - pilot.xp_total : 0;
  const progress = nextRank
    ? Math.min(100, (pilot.xp_total / nextRank.xp_required) * 100)
    : 100;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link to="/pilots" className="text-stone-400 hover:text-stone-200"><ChevronLeft className="w-5 h-5" /></Link>
        <div>
          <h1>{pilot.name}</h1>
          <p className="text-stone-400 text-sm">{pilot.player_callsign}</p>
        </div>
      </div>

      {/* Rank-up banner */}
      {pilot.rank_up_pending === 1 && (
        <div className="bg-amber-900/40 border border-amber-600 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Award className="w-6 h-6 text-amber-400" />
            <div>
              <p className="font-semibold text-amber-300">Promotion Pending!</p>
              <p className="text-sm text-amber-200/70">Select your Pilot Special Abilities</p>
            </div>
          </div>
          <button onClick={() => setShowPSA(true)} className="btn-primary btn-sm">
            Select PSA →
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Rank & XP */}
        <div className="card space-y-4">
          <h3 className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-amber-400" /> Rank & Experience</h3>

          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Rank"  value={RANK_NAMES[pilot.rank]} />
            <Stat label="Skill" value={pilot.skill} />
            <Stat label="XP"    value={pilot.xp_total} />
          </div>

          {nextRank && (
            <div>
              <div className="flex justify-between text-xs text-stone-400 mb-1">
                <span>→ {nextRank.name}</span>
                <span>{xpToNext > 0 ? `${xpToNext} XP needed` : 'XP met'}</span>
              </div>
              <div className="h-2 bg-stone-700 rounded-full overflow-hidden">
                <div className="h-full bg-amber-600 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              {nextRank.psa_required > pilot.psa_slots_used && (
                <p className="text-xs text-stone-500 mt-1">
                  Also needs {nextRank.psa_required - pilot.psa_slots_used} more PSA(s) selected
                </p>
              )}
            </div>
          )}

          <div className="flex justify-between text-xs text-stone-400 pt-2 border-t border-stone-700">
            <span>PSA Slots: {pilot.psa_slots_used} / {pilot.psa_slots_available}</span>
            {pilot.rank_eligibility?.eligible && !pilot.rank_up_pending && (
              <span className="text-green-400">Eligible for promotion</span>
            )}
          </div>
        </div>

        {/* Assigned unit */}
        <div className="card space-y-3">
          <h3 className="flex items-center gap-2"><Shield className="w-4 h-4 text-blue-400" /> Assigned Unit</h3>
          {pilot.current_unit ? (
            <Link to={`/units/${pilot.current_unit.id}`}
              className="flex items-center justify-between p-3 bg-stone-700/50 rounded-lg hover:bg-stone-700">
              <div>
                <p className="font-medium">{pilot.current_unit.name}</p>
                <p className="text-xs text-stone-400">{pilot.current_unit.unit_type} · Size {pilot.current_unit.size}</p>
              </div>
              <span className="badge badge-blue">Assigned</span>
            </Link>
          ) : (
            <p className="text-stone-500 text-sm">No unit assigned</p>
          )}
        </div>
      </div>

      {/* PSA list */}
      {pilot.psas.length > 0 && (
        <div className="card space-y-3">
          <h3 className="flex items-center gap-2"><Award className="w-4 h-4 text-amber-400" /> Pilot Special Abilities</h3>
          <div className="space-y-2">
            {pilot.psas.map(psa => (
              <div key={psa.id} className="p-3 bg-stone-700/50 rounded-lg">
                <p className="font-medium text-stone-100">{psa.name}</p>
                <p className="text-sm text-stone-400 mt-0.5">{psa.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* XP log */}
      <div className="card space-y-3">
        <h3>Experience History</h3>
        {pilot.xp_log.length === 0 ? (
          <p className="text-stone-500 text-sm">No XP recorded yet.</p>
        ) : (
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {pilot.xp_log.map(e => (
              <div key={e.id} className="flex items-center justify-between py-2 border-b border-stone-700/50 text-sm">
                <div>
                  <span className="text-stone-300">{XP_TYPE_LABELS[e.event_type] || e.event_type}</span>
                  {e.notes && <span className="text-stone-500 text-xs ml-2">· {e.notes}</span>}
                </div>
                <div className="flex items-center gap-3 text-right">
                  <span className="text-green-400 font-semibold">+{e.xp_awarded} XP</span>
                  <span className="text-stone-600 text-xs">{new Date(e.occurred_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showPSA && (
        <PSAModal
          pilot={pilot}
          onClose={() => setShowPSA(false)}
          onComplete={async (updated) => {
            setShowPSA(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-stone-700/50 rounded-lg py-3">
      <p className="text-xs text-stone-400 mb-1">{label}</p>
      <p className="text-xl font-bold text-stone-100">{value}</p>
    </div>
  );
}
