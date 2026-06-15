import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Upload, Plus, ChevronLeft, Crosshair, Zap, Shield } from 'lucide-react';
import { api } from '../api/client';
import DamageTracker from '../components/units/DamageTracker';
import toast from 'react-hot-toast';

const DAMAGE_TYPES = [
  { key: 'tac',      label: 'TAC (2 XP)' },
  { key: 'critical', label: 'Critical (1 XP)' },
  { key: 'melee',    label: 'Melee (1 XP)' },
];

export default function PlayMode() {
  const { sessionId } = useParams();
  const [session,  setSession]  = useState(null);
  const [enemies,  setEnemies]  = useState([]);
  const [pilots,   setPilots]   = useState([]);
  const [turn,     setTurn]     = useState(1);
  const [expanded, setExpanded] = useState(null);
  const [killModal, setKillModal] = useState(null); // enemy unit
  const [killPilotId, setKillPilotId] = useState('');
  const [dmgModal,  setDmgModal]  = useState(null); // enemy unit
  const [dmgType,   setDmgType]   = useState('tac');
  const [dmgPilotId,setDmgPilotId]= useState('');
  const [importJson, setImportJson] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [preview,   setPreview]   = useState(null);
  const fileRef = useRef();

  const load = async () => {
    try {
      const [sess, enemyData, pilotList] = await Promise.all([
        api.contracts.getSession(sessionId),
        api.play.session(sessionId),
        api.pilots.list(),
      ]);
      setSession(sess);
      setEnemies(enemyData.units || []);
      setPilots(pilotList);
    } catch (e) { toast.error('Failed to load play mode'); }
  };

  useEffect(() => { load(); }, [sessionId]);

  // ── Jeff Import ────────────────────────────────────────────────
  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImportJson(ev.target.result);
    reader.readAsText(file);
  };

  const previewImport = async () => {
    if (!importJson) return;
    try {
      const result = await api.play.preview({ json: JSON.parse(importJson) });
      setPreview(result);
    } catch (e) { toast.error('Invalid JSON: ' + e.message); }
  };

  const confirmImport = async () => {
    try {
      const result = await api.play.import({ session_id: sessionId, json: JSON.parse(importJson) });
      toast.success(`Imported ${result.imported} units`);
      setShowImport(false);
      setPreview(null);
      setImportJson('');
      load();
    } catch (e) { toast.error(e.message); }
  };

  // ── Damage tracking ────────────────────────────────────────────
  const applyEnemyDamage = async (enemyId, updates) => {
    try {
      const updated = await api.play.updateEnemy(enemyId, updates);
      setEnemies(prev => prev.map(e => e.id === enemyId ? { ...e, ...updated } : e));
    } catch (e) { toast.error(e.message); }
  };

  // ── Log pilot damage ───────────────────────────────────────────
  const logDamage = async () => {
    if (!dmgPilotId || !dmgModal) return;
    try {
      await api.play.logDamage(dmgModal.id, {
        pilot_id: dmgPilotId, damage_type: dmgType,
        turn_number: turn, session_id: sessionId,
      });
      // Auto-award XP
      const dmgTypeMap = { tac: 'damage_tac', critical: 'damage_critical', melee: 'damage_melee' };
      await api.xp.damage({ pilot_id: dmgPilotId, damage_type: dmgTypeMap[dmgType], session_id: sessionId });
      toast.success('Damage logged + XP awarded');
      setDmgModal(null);
    } catch (e) { toast.error(e.message); }
  };

  // ── Kill credit ────────────────────────────────────────────────
  const assignKill = async () => {
    if (!killPilotId || !killModal) return;
    try {
      const result = await api.play.assignKill(killModal.id, {
        pilot_id: killPilotId, session_id: sessionId,
      });
      toast.success(`Kill awarded! +${result.xp} XP${result.promoted ? ' — PROMOTED!' : ''}`);
      setKillModal(null);
      load();
    } catch (e) { toast.error(e.message); }
  };

  const statusColor = { active: 'border-stone-700', destroyed: 'border-red-800 opacity-60', withdrawn: 'border-stone-800 opacity-40' };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link to={`/contracts/sessions/${sessionId}`} className="text-stone-400 hover:text-stone-200">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-red-400" /> Play Mode
            </h1>
            <p className="text-sm text-stone-400">{session?.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-stone-800 border border-stone-700 rounded-lg px-3 py-2">
            <span className="text-sm text-stone-400">Turn</span>
            <button onClick={() => setTurn(t => Math.max(1, t - 1))} className="text-stone-400 hover:text-stone-100 px-1">−</button>
            <span className="font-bold text-amber-400 w-6 text-center">{turn}</span>
            <button onClick={() => setTurn(t => t + 1)} className="text-stone-400 hover:text-stone-100 px-1">+</button>
          </div>
          <button onClick={() => setShowImport(v => !v)} className="btn-ghost btn-sm">
            <Upload className="w-4 h-4" /> Import JSON
          </button>
        </div>
      </div>

      {/* Jeff import panel */}
      {showImport && (
        <div className="card space-y-4">
          <h3>Import from Jeff's Battletech Tool</h3>
          <div className="flex gap-3 items-center">
            <button onClick={() => fileRef.current?.click()} className="btn-ghost btn-sm">
              <Upload className="w-4 h-4" /> Choose File
            </button>
            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFile} />
            {importJson && <span className="text-xs text-green-400">JSON loaded ({Math.round(importJson.length / 1024)}KB)</span>}
          </div>
          {importJson && !preview && (
            <button onClick={previewImport} className="btn-primary btn-sm">Preview Units</button>
          )}
          {preview && (
            <div className="space-y-3">
              <p className="text-sm text-stone-300">
                Found <strong className="text-amber-400">{preview.units?.length}</strong> units across{' '}
                <strong className="text-amber-400">{preview.groups?.length}</strong> groups:
                {preview.groups?.join(', ')}
              </p>
              {preview.errors?.length > 0 && (
                <div className="text-xs text-red-400 bg-red-900/20 rounded p-2">
                  {preview.errors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
              <div className="max-h-48 overflow-y-auto space-y-1">
                {preview.units?.map((u, i) => (
                  <div key={i} className="flex items-center justify-between text-sm px-3 py-1.5 bg-stone-700/40 rounded-lg">
                    <span>{u.name}</span>
                    <span className="text-stone-400 text-xs">{u.unit_type} sz{u.size} · {u.base_pv} PV · {u.group_name}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={confirmImport} className="btn-primary">Confirm Import</button>
                <button onClick={() => { setPreview(null); setImportJson(''); }} className="btn-ghost">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Enemy units */}
      {enemies.length === 0 && (
        <div className="card text-center py-8 text-stone-500">
          No enemy units. Import from Jeff's tool or add manually.
        </div>
      )}

      {/* Group by lance */}
      {Object.entries(
        enemies.reduce((acc, u) => {
          const g = u.group_name || 'Ungrouped';
          acc[g] = acc[g] || [];
          acc[g].push(u);
          return acc;
        }, {})
      ).map(([group, units]) => (
        <div key={group} className="space-y-3">
          <h3 className="text-stone-400 text-sm uppercase tracking-wide border-b border-stone-700 pb-1">{group}</h3>
          {units.map(enemy => (
            <div key={enemy.id} className={`card border ${statusColor[enemy.status] || 'border-stone-700'} space-y-3`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{enemy.name}</span>
                    {enemy.variant && <span className="text-stone-500 text-xs">{enemy.variant}</span>}
                    <span className={`badge ${enemy.status === 'active' ? 'badge-green' : enemy.status === 'destroyed' ? 'badge-red' : 'badge-stone'}`}>
                      {enemy.status}
                    </span>
                  </div>
                  <p className="text-xs text-stone-400">
                    {enemy.unit_type} sz{enemy.size} · {enemy.base_pv} PV · Skill {enemy.pilot_skill}
                    {enemy.kill_credit_pilot && <span className="text-red-300 ml-2">✕ {enemy.kill_credit_pilot.name}</span>}
                  </p>
                </div>
                <div className="flex gap-2">
                  {enemy.status === 'active' && (
                    <>
                      <button onClick={() => { setDmgModal(enemy); setDmgType('tac'); setDmgPilotId(''); }}
                        className="btn-ghost btn-sm"><Zap className="w-3 h-3" /> Damage</button>
                      <button onClick={() => { setKillModal(enemy); setKillPilotId(''); }}
                        className="btn-danger btn-sm"><Crosshair className="w-3 h-3" /> Kill</button>
                    </>
                  )}
                  <button onClick={() => setExpanded(expanded === enemy.id ? null : enemy.id)}
                    className="btn-ghost btn-sm">{expanded === enemy.id ? 'Hide' : 'Track'}</button>
                </div>
              </div>

              {expanded === enemy.id && (
                <div className="border-t border-stone-700 pt-3">
                  <DamageTracker unit={enemy} onChange={(u) => applyEnemyDamage(enemy.id, u)} />
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* Damage log modal */}
      {dmgModal && (
        <Modal title={`Log Damage — ${dmgModal.name}`} onClose={() => setDmgModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="label">Pilot</label>
              <select className="input" value={dmgPilotId} onChange={e => setDmgPilotId(e.target.value)}>
                <option value="">Select pilot…</option>
                {pilots.map(p => <option key={p.id} value={p.id}>{p.name} ({p.player_callsign})</option>)}
              </select>
            </div>
            <div>
              <label className="label">Damage Type</label>
              <div className="flex gap-2">
                {DAMAGE_TYPES.map(d => (
                  <button key={d.key} onClick={() => setDmgType(d.key)}
                    className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${dmgType === d.key ? 'border-amber-600 bg-amber-900/30 text-amber-300' : 'border-stone-600 text-stone-400 hover:border-stone-500'}`}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={logDamage} disabled={!dmgPilotId} className="btn-primary flex-1">Log Damage + Award XP</button>
              <button onClick={() => setDmgModal(null)} className="btn-ghost">Cancel</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Kill modal */}
      {killModal && (
        <Modal title={`Assign Kill — ${killModal.name}`} onClose={() => setKillModal(null)}>
          <div className="space-y-4">
            <p className="text-sm text-stone-400">
              Select the pilot who gets kill credit. XP will be calculated based on enemy size ({killModal.size}),
              type ({killModal.unit_type}), and skill disparity.
            </p>
            <div>
              <label className="label">Kill Credit Pilot</label>
              <select className="input" value={killPilotId} onChange={e => setKillPilotId(e.target.value)}>
                <option value="">Select pilot…</option>
                {pilots.map(p => <option key={p.id} value={p.id}>{p.name} — Skill {p.skill} ({p.player_callsign})</option>)}
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={assignKill} disabled={!killPilotId} className="btn-danger flex-1">
                <Crosshair className="w-4 h-4" /> Confirm Kill
              </button>
              <button onClick={() => setKillModal(null)} className="btn-ghost">Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-stone-800 rounded-2xl border border-stone-700 shadow-2xl max-w-md w-full">
        <div className="flex items-center justify-between p-5 border-b border-stone-700">
          <h3>{title}</h3>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-300 text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
