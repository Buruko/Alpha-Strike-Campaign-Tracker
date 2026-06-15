import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Play, Square, CheckCircle, Coins } from 'lucide-react';
import { api } from '../api/client';
import toast from 'react-hot-toast';

export default function SessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession]   = useState(null);
  const [showObj, setShowObj]   = useState(false);
  const [objForm, setObjForm]   = useState({ description: '', objective_type: 'action', xp_reward: 1 });
  const [payout, setPayout]     = useState('');
  const [showPayout, setShowPayout] = useState(false);

  const load = () => api.contracts.getSession(id).then(setSession).catch(() => {});
  useEffect(() => { load(); }, [id]);

  const start    = async () => { try { await api.contracts.startSession(id);    toast.success('Session started'); load(); } catch (e) { toast.error(e.message); } };
  const end      = async () => { try { await api.contracts.endSession(id);      toast.success('Session ended — go to Salvage'); load(); } catch (e) { toast.error(e.message); } };
  const complete = async () => { try { await api.contracts.completeSession(id); toast.success('Session complete'); load(); } catch (e) { toast.error(e.message); } };

  const addObj = async (e) => {
    e.preventDefault();
    try {
      await api.contracts.addObjective(id, objForm);
      toast.success('Objective added');
      setShowObj(false);
      setObjForm({ description: '', objective_type: 'action', xp_reward: 1 });
      load();
    } catch (err) { toast.error(err.message); }
  };

  const addPayout = async (e) => {
    e.preventDefault();
    try {
      await api.accounting.missionPayout({ amount: parseInt(payout), description: `Mission payout: ${session?.name}`, session_id: id });
      toast.success(`${payout} pts added to campaign account`);
      setPayout('');
      setShowPayout(false);
    } catch (err) { toast.error(err.message); }
  };

  if (!session) return <div className="text-stone-400 py-12 text-center">Loading…</div>;

  const STATUS_COLOR = { setup:'text-stone-400', active:'text-green-400', post:'text-amber-400', complete:'text-blue-400' };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link to="/contracts" className="text-stone-400 hover:text-stone-200"><ChevronLeft className="w-5 h-5" /></Link>
        <div>
          <h1>{session.name}</h1>
          <p className="text-sm">
            <span className="text-stone-500">{session.contract_name} · </span>
            <span className={`font-medium capitalize ${STATUS_COLOR[session.status]}`}>{session.status}</span>
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="card flex flex-wrap gap-3">
        {session.status === 'setup' && (
          <button onClick={start} className="btn-primary"><Play className="w-4 h-4" /> Start Session</button>
        )}
        {session.status === 'active' && (
          <>
            <Link to={`/play/${id}`} className="btn-primary"><Play className="w-4 h-4" /> Play Mode</Link>
            <button onClick={end} className="btn-ghost"><Square className="w-4 h-4" /> End Session</button>
          </>
        )}
        {session.status === 'post' && (
          <>
            <Link to={`/salvage/${id}`} className="btn-primary">Salvage Review</Link>
            <button onClick={() => setShowPayout(v => !v)} className="btn-ghost"><Coins className="w-4 h-4" /> Mission Payout</button>
            <button onClick={complete} className="btn-ghost"><CheckCircle className="w-4 h-4" /> Mark Complete</button>
          </>
        )}
      </div>

      {showPayout && (
        <form onSubmit={addPayout} className="card flex gap-3 items-end max-w-sm">
          <div className="flex-1">
            <label className="label">Payout (pts)</label>
            <input type="number" className="input" min="1" value={payout} onChange={e => setPayout(e.target.value)} required />
          </div>
          <button type="submit" className="btn-primary">Add</button>
          <button type="button" onClick={() => setShowPayout(false)} className="btn-ghost">Cancel</button>
        </form>
      )}

      {/* Objectives */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h3>Objectives</h3>
          <button onClick={() => setShowObj(v => !v)} className="btn-ghost btn-sm"><Plus className="w-3 h-3" /> Add</button>
        </div>

        {showObj && (
          <form onSubmit={addObj} className="space-y-3 bg-stone-700/40 rounded-lg p-4">
            <div>
              <label className="label">Description</label>
              <input className="input" value={objForm.description} onChange={e => setObjForm(f => ({...f, description: e.target.value}))} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Type</label>
                <select className="input" value={objForm.objective_type} onChange={e => setObjForm(f => ({...f, objective_type: e.target.value}))}>
                  <option value="hold">Hold</option>
                  <option value="action">Action</option>
                  <option value="kill">Kill</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label className="label">XP Reward</label>
                <input type="number" className="input" min="1" value={objForm.xp_reward} onChange={e => setObjForm(f => ({...f, xp_reward: parseInt(e.target.value)}))} />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary btn-sm">Add Objective</button>
              <button type="button" onClick={() => setShowObj(false)} className="btn-ghost btn-sm">Cancel</button>
            </div>
          </form>
        )}

        {session.objectives?.length === 0 && <p className="text-stone-500 text-sm">No objectives defined.</p>}
        {session.objectives?.map(obj => (
          <div key={obj.id} className={`flex items-center justify-between p-3 rounded-lg ${obj.completed ? 'bg-green-900/20 border border-green-800/40' : 'bg-stone-700/40'}`}>
            <div>
              <p className={`font-medium ${obj.completed ? 'line-through text-stone-500' : 'text-stone-100'}`}>{obj.description}</p>
              <p className="text-xs text-stone-500 capitalize">{obj.objective_type} · {obj.xp_reward} XP</p>
            </div>
            {obj.completed && <CheckCircle className="w-5 h-5 text-green-400" />}
          </div>
        ))}
      </div>
    </div>
  );
}
