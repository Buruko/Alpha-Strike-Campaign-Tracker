import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, Shield, Wrench, Coins, Sword, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

export default function Dashboard() {
  const { user, isGM, isQM, isTechnician } = useAuth();
  const [pilots,  setPilots]  = useState([]);
  const [units,   setUnits]   = useState([]);
  const [repairs, setRepairs] = useState([]);
  const [balance, setBalance] = useState(null);

  useEffect(() => {
    api.pilots.list().then(setPilots).catch(() => {});
    api.units.list().then(setUnits).catch(() => {});
    if (isTechnician || isQM) api.repairs.list().then(setRepairs).catch(() => {});
    if (isQM) api.accounting.balance().then(d => setBalance(d.balance)).catch(() => {});
  }, [isQM, isTechnician]);

  const pendingRepairs = repairs.filter(r => r.status === 'pending' || r.status === 'approved');
  const damagedUnits   = units.filter(u => (u.armor_dmg + u.structure_dmg + u.engine_dmg) > 0);
  const rankUpPilots   = pilots.filter(p => p.rank_up_pending);

  return (
    <div className="space-y-6">
      <div>
        <h1>Campaign Dashboard</h1>
        <p className="text-stone-400 text-sm mt-1">
          Welcome back, <span className="text-amber-400 font-medium">{user?.username}</span>
          {user?.role && <span className="ml-2 badge badge-amber capitalize">{user.role}</span>}
        </p>
      </div>

      {/* Rank-up alerts */}
      {rankUpPilots.length > 0 && (
        <div className="bg-amber-900/30 border border-amber-700 rounded-xl p-4">
          <p className="font-semibold text-amber-300 mb-2">⚔ Promotion Pending</p>
          <div className="space-y-1">
            {rankUpPilots.map(p => (
              <Link key={p.id} to={`/pilots/${p.id}`}
                className="flex items-center gap-2 text-sm text-amber-200 hover:text-amber-100">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                {p.name} — select Pilot Special Abilities
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          icon={<Users className="w-6 h-6 text-blue-400" />}
          label="Pilots"
          value={pilots.length}
          sub={`${rankUpPilots.length} awaiting promotion`}
          to="/pilots"
          color="blue"
        />
        <SummaryCard
          icon={<Shield className="w-6 h-6 text-amber-400" />}
          label="Units"
          value={units.length}
          sub={`${damagedUnits.length} damaged`}
          to="/units"
          color="amber"
        />
        {(isTechnician || isQM) && (
          <SummaryCard
            icon={<Wrench className="w-6 h-6 text-green-400" />}
            label="Repairs"
            value={pendingRepairs.length}
            sub="pending / approved"
            to="/repairs"
            color="green"
          />
        )}
        {isQM && balance !== null && (
          <SummaryCard
            icon={<Coins className="w-6 h-6 text-yellow-400" />}
            label="Balance"
            value={`${balance} pts`}
            sub="campaign fund"
            to="/accounting"
            color="yellow"
          />
        )}
      </div>

      {/* Pilot roster */}
      <section className="card">
        <div className="flex items-center justify-between mb-4">
          <h2>My Pilots</h2>
          <Link to="/pilots" className="text-sm text-amber-400 hover:text-amber-300">View all →</Link>
        </div>
        {pilots.length === 0 ? (
          <p className="text-stone-500 text-sm">No pilots yet.</p>
        ) : (
          <div className="space-y-2">
            {pilots.slice(0, 5).map(pilot => (
              <Link key={pilot.id} to={`/pilots/${pilot.id}`}
                className="flex items-center justify-between p-3 rounded-lg bg-stone-700/50 hover:bg-stone-700 transition-colors">
                <div>
                  <span className="font-medium text-stone-100">{pilot.name}</span>
                  {pilot.rank_up_pending === 1 && (
                    <span className="ml-2 badge badge-amber">Promotion!</span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-stone-400">
                  <span>Rank {pilot.rank}</span>
                  <span>Skill {pilot.skill}</span>
                  <span className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />{pilot.xp_total} XP
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Damaged units summary */}
      {damagedUnits.length > 0 && (
        <section className="card">
          <div className="flex items-center justify-between mb-4">
            <h2>Damaged Units</h2>
            <Link to="/units" className="text-sm text-amber-400 hover:text-amber-300">View all →</Link>
          </div>
          <div className="space-y-2">
            {damagedUnits.slice(0, 4).map(unit => (
              <Link key={unit.id} to={`/units/${unit.id}`}
                className="flex items-center justify-between p-3 rounded-lg bg-stone-700/50 hover:bg-stone-700">
                <span className="font-medium">{unit.name}</span>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-red-400">⚠ {unit.repair_cost_current} pts to repair</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value, sub, to, color }) {
  const colors = { blue:'border-blue-800', amber:'border-amber-800', green:'border-green-800', yellow:'border-yellow-800' };
  return (
    <Link to={to} className={`card border ${colors[color] || 'border-stone-700'} hover:bg-stone-700/80 transition-colors`}>
      <div className="flex items-center gap-3 mb-2">{icon}<span className="text-sm text-stone-400">{label}</span></div>
      <p className="text-2xl font-bold text-stone-100">{value}</p>
      {sub && <p className="text-xs text-stone-500 mt-1">{sub}</p>}
    </Link>
  );
}
