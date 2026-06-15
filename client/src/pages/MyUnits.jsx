import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Shield, AlertTriangle } from 'lucide-react';
import { api } from '../api/client';

export default function MyUnits() {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.units.list().then(setUnits).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-stone-400 py-12 text-center">Loading…</div>;

  const TYPE_LABELS = { BM:'BattleMech', CV:'Vehicle', CF:'Aerospace', BA:'Battle Armor', CI:'Infantry' };

  return (
    <div className="space-y-6">
      <h1>My Units</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {units.map(unit => {
          const totalDmg = unit.armor_dmg + unit.structure_dmg + unit.engine_dmg + unit.fcu_dmg + unit.mp_dmg + unit.weapon_dmg;
          const isDamaged = totalDmg > 0;
          return (
            <Link key={unit.id} to={`/units/${unit.id}`}
              className="card hover:bg-stone-700/80 transition-colors space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-amber-400" />
                    <span className="font-semibold">{unit.name}</span>
                    {unit.variant && <span className="text-xs text-stone-500">{unit.variant}</span>}
                  </div>
                  <p className="text-xs text-stone-400 mt-1">
                    {TYPE_LABELS[unit.unit_type] || unit.unit_type} · Size {unit.size} · {unit.base_pv} PV
                  </p>
                </div>
                {isDamaged && (
                  <div className="flex items-center gap-1 text-red-400 text-xs">
                    <AlertTriangle className="w-3 h-3" />
                    {unit.repair_cost_current} pts
                  </div>
                )}
              </div>

              {/* Armor bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-stone-500">
                  <span>Armor</span>
                  <span>{unit.armor_max - unit.armor_dmg}/{unit.armor_max}</span>
                </div>
                <div className="h-2 bg-stone-700 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-600 rounded-full transition-all"
                    style={{ width: `${((unit.armor_max - unit.armor_dmg) / unit.armor_max) * 100}%` }} />
                </div>
                <div className="flex justify-between text-xs text-stone-500">
                  <span>Structure</span>
                  <span>{unit.structure_max - unit.structure_dmg}/{unit.structure_max}</span>
                </div>
                <div className="h-2 bg-stone-700 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-700 rounded-full transition-all"
                    style={{ width: `${((unit.structure_max - unit.structure_dmg) / unit.structure_max) * 100}%` }} />
                </div>
              </div>

              {unit.current_pilot && (
                <div className="text-xs text-stone-400 border-t border-stone-700 pt-2">
                  Pilot: <span className="text-stone-200">{unit.current_pilot.name}</span>
                  <span className="ml-2 text-stone-500">Skill {unit.current_pilot.skill}</span>
                </div>
              )}
            </Link>
          );
        })}
        {units.length === 0 && (
          <p className="text-stone-500 text-sm col-span-2 text-center py-8">No units assigned to you.</p>
        )}
      </div>
    </div>
  );
}
