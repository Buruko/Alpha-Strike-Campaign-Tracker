/**
 * DamageTracker
 * Renders clickable armor/structure pips and critical hit slots.
 * Calls onChange(updates) with new damage counts.
 */
export default function DamageTracker({ unit, onChange, readonly = false }) {
  if (!unit) return null;

  const {
    armor_max, structure_max, engine_hits_max, fcu_hits_max, mp_hits_max, weapon_hits_max,
    armor_dmg, structure_dmg, engine_dmg, fcu_dmg, mp_dmg, weapon_dmg,
    cost_per_pip,
  } = unit;

  function toggle(field, maxField, dmgField, index) {
    if (readonly) return;
    const total   = unit[maxField];
    const damaged = unit[dmgField];
    // clicking an intact pip damages it; clicking a damaged pip repairs it
    const newDmg  = index < damaged ? index : index + 1;
    onChange({ [field]: Math.min(newDmg, total) });
  }

  function PipRow({ label, max, damaged, dmgField, color = 'amber', costLabel }) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-xs text-stone-400 w-20 flex-shrink-0">{label}</span>
        <div className="flex gap-1 flex-wrap">
          {Array.from({ length: max }).map((_, i) => (
            <button
              key={i}
              onClick={() => toggle(dmgField, dmgField.replace('_dmg', '_max'), dmgField, i)}
              className={`w-5 h-5 rounded border transition-all ${
                i < damaged
                  ? 'bg-red-800 border-red-600'
                  : color === 'amber'
                    ? 'bg-stone-600 border-stone-500 hover:bg-amber-700'
                    : 'bg-stone-600 border-orange-700/50 hover:bg-orange-700'
              } ${readonly ? 'cursor-default' : 'cursor-pointer'}`}
              disabled={readonly}
              title={`${label} pip ${i + 1}${i < damaged ? ' (damaged)' : ''}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className={`text-xs font-mono ${damaged > 0 ? 'text-red-400' : 'text-stone-500'}`}>
            {damaged}/{max}
          </span>
          {cost_per_pip && costLabel && (
            <span className="text-xs text-stone-500">
              ({damaged * cost_per_pip[costLabel]} pts)
            </span>
          )}
        </div>
      </div>
    );
  }

  function CritRow({ label, max, damaged, dmgField, costKey }) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-xs text-stone-400 w-20 flex-shrink-0">{label}</span>
        <div className="flex gap-1">
          {Array.from({ length: max }).map((_, i) => (
            <button
              key={i}
              onClick={() => {
                if (readonly) return;
                const newDmg = i < damaged ? i : i + 1;
                onChange({ [dmgField]: Math.min(newDmg, max) });
              }}
              className={`w-5 h-5 rounded border transition-all ${
                i < damaged
                  ? 'bg-red-800 border-red-600'
                  : 'bg-stone-600 border-stone-500 hover:bg-red-800'
              } ${readonly ? 'cursor-default' : 'cursor-pointer'}`}
              disabled={readonly}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className={`text-xs font-mono ${damaged > 0 ? 'text-red-400' : 'text-stone-500'}`}>
            {damaged}/{max}
          </span>
          {cost_per_pip && (
            <span className="text-xs text-stone-500">
              ({damaged * cost_per_pip[costKey]} pts)
            </span>
          )}
        </div>
      </div>
    );
  }

  const totalDamage = armor_dmg + structure_dmg + engine_dmg + fcu_dmg + mp_dmg + weapon_dmg;
  const isDestroyed = structure_dmg >= structure_max;

  return (
    <div className="space-y-2">
      {isDestroyed && (
        <div className="text-center text-xs font-bold text-red-400 bg-red-900/20 border border-red-800 rounded-lg py-1">
          DESTROYED
        </div>
      )}

      <PipRow label="Armor"     max={armor_max}     damaged={armor_dmg}     dmgField="armor_dmg"     color="amber"  costLabel="armor" />
      <PipRow label="Structure" max={structure_max} damaged={structure_dmg} dmgField="structure_dmg" color="orange" costLabel="structure" />

      <div className="border-t border-stone-700 pt-2 mt-2 space-y-2">
        <p className="text-xs text-stone-500 uppercase tracking-wide">Critical Hits</p>
        <CritRow label="Engine"  max={engine_hits_max} damaged={engine_dmg} dmgField="engine_dmg" costKey="engine" />
        <CritRow label="Fire Con" max={fcu_hits_max}   damaged={fcu_dmg}   dmgField="fcu_dmg"    costKey="fcu" />
        <CritRow label="MP/Motive" max={mp_hits_max}  damaged={mp_dmg}    dmgField="mp_dmg"     costKey="mp" />
        <CritRow label="Weapons" max={weapon_hits_max} damaged={weapon_dmg} dmgField="weapon_dmg" costKey="weapon" />
      </div>

      {unit.repair_cost_current > 0 && (
        <div className="border-t border-stone-700 pt-2 flex justify-between text-xs">
          <span className="text-stone-400">Current Repair Cost</span>
          <span className="text-amber-400 font-semibold">{unit.repair_cost_current} pts</span>
        </div>
      )}
    </div>
  );
}
