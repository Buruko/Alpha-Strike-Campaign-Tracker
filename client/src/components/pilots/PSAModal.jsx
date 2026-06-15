import { useState, useEffect } from 'react';
import { Award, CheckCircle, X } from 'lucide-react';
import { api } from '../../api/client';
import toast from 'react-hot-toast';

export default function PSAModal({ pilot, onClose, onComplete }) {
  const [psas, setPsas]         = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    api.pilots.availablePsas(pilot.id).then(setPsas).catch(() => {});
  }, [pilot.id]);

  const slotsRemaining = pilot.psa_slots_available - pilot.psa_slots_used;

  const confirm = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      await api.pilots.selectPsa(pilot.id, { psa_def_id: selected.id });
      const newSlotsUsed = pilot.psa_slots_used + 1;
      const needsMore    = newSlotsUsed < pilot.psa_slots_available;

      toast.success(`${selected.name} selected!`);

      if (!needsMore) {
        await api.pilots.dismissRankup(pilot.id);
        onComplete();
      } else {
        // Reload pilot and psas to pick next slot
        const updated = await api.pilots.get(pilot.id);
        const avail   = await api.pilots.availablePsas(pilot.id);
        setPsas(avail);
        setSelected(null);
        onComplete(updated);
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const rankNames = { 0: 'Starting', 1: 'Rank I', 2: 'Rank II', 3: 'Rank III', 4: 'Rank IV' };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-stone-800 rounded-2xl border border-amber-700 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-stone-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-900/60 rounded-full flex items-center justify-center">
              <Award className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="font-bold text-amber-400">Promotion!</h2>
              <p className="text-sm text-stone-400">
                {pilot.name} reached {rankNames[pilot.rank]} — select a Pilot Special Ability
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Slot indicator */}
        <div className="px-6 py-3 bg-stone-900/50 border-b border-stone-700">
          <p className="text-xs text-stone-400">
            Selecting slot <span className="text-amber-400 font-semibold">{pilot.psa_slots_used + 1}</span> of{' '}
            <span className="text-amber-400 font-semibold">{pilot.psa_slots_available}</span>
            {slotsRemaining > 1 && ` · ${slotsRemaining - 1} more after this`}
          </p>
        </div>

        {/* PSA list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {psas.length === 0 && (
            <p className="text-stone-500 text-center py-8">No available PSAs</p>
          )}
          {psas.map(psa => (
            <button
              key={psa.id}
              onClick={() => setSelected(psa)}
              className={`w-full text-left p-4 rounded-xl border transition-all ${
                selected?.id === psa.id
                  ? 'border-amber-600 bg-amber-900/30'
                  : 'border-stone-700 bg-stone-900/50 hover:border-stone-500'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  selected?.id === psa.id ? 'border-amber-500 bg-amber-500' : 'border-stone-500'
                }`}>
                  {selected?.id === psa.id && <CheckCircle className="w-4 h-4 text-white" />}
                </div>
                <div>
                  <p className="font-medium text-stone-100">{psa.name}</p>
                  <p className="text-sm text-stone-400 mt-1">{psa.description}</p>
                  <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-stone-700 text-stone-400">
                    Requires {rankNames[psa.min_rank]}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-stone-700 flex justify-end gap-3">
          <button onClick={onClose} className="btn-ghost">Decide Later</button>
          <button
            onClick={confirm}
            disabled={!selected || loading}
            className="btn-primary"
          >
            {loading ? 'Saving…' : `Confirm: ${selected?.name || 'Select an ability'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
