import { useState } from 'react';
import { Settings, Plus, Key } from 'lucide-react';
import { api } from '../api/client';
import toast from 'react-hot-toast';

const ROLES = ['player', 'technician', 'quartermaster', 'gm'];

export default function Admin() {
  const [form, setForm] = useState({ username: '', password: '', role: 'player', callsign: '' });
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [showCreate, setShowCreate] = useState(false);
  const [showPw, setShowPw]         = useState(false);

  const createUser = async (e) => {
    e.preventDefault();
    try {
      await api.auth.register(form);
      toast.success(`User "${form.username}" created`);
      setForm({ username: '', password: '', role: 'player', callsign: '' });
      setShowCreate(false);
    } catch (err) { toast.error(err.message); }
  };

  const changePw = async (e) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirm) {
      toast.error('Passwords do not match'); return;
    }
    try {
      await api.auth.changePassword({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
      toast.success('Password changed');
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
      setShowPw(false);
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="flex items-center gap-2"><Settings className="w-6 h-6 text-stone-400" /> Administration</h1>

      {/* Create user */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h3>User Management</h3>
          <button onClick={() => setShowCreate(v => !v)} className="btn-primary btn-sm">
            <Plus className="w-4 h-4" /> New User
          </button>
        </div>
        {showCreate && (
          <form onSubmit={createUser} className="space-y-4 bg-stone-700/40 rounded-lg p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Username</label>
                <input className="input" value={form.username} onChange={e => setForm(f => ({...f, username: e.target.value}))} required />
              </div>
              <div>
                <label className="label">Password</label>
                <input type="password" className="input" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} required minLength={8} />
              </div>
              <div>
                <label className="label">Role</label>
                <select className="input" value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))}>
                  {ROLES.map(r => <option key={r} value={r} className="capitalize">{r}</option>)}
                </select>
              </div>
              {form.role === 'player' && (
                <div>
                  <label className="label">Callsign</label>
                  <input className="input" value={form.callsign} onChange={e => setForm(f => ({...f, callsign: e.target.value}))}
                    placeholder="Defaults to username" />
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary">Create User</button>
              <button type="button" onClick={() => setShowCreate(false)} className="btn-ghost">Cancel</button>
            </div>
          </form>
        )}
        <div className="text-sm text-stone-500 space-y-1">
          <p>Role capabilities:</p>
          <ul className="space-y-1 ml-4 text-xs">
            <li><span className="text-stone-300">Player</span> — manage own pilots, track unit damage, view XP history</li>
            <li><span className="text-stone-300">Technician</span> — create and complete repair jobs</li>
            <li><span className="text-stone-300">Quartermaster</span> — manage unit roster, assign pilots, sell units, approve repairs, handle salvage, view ledger</li>
            <li><span className="text-stone-300">GM</span> — full access: award XP, run play mode, manage contracts, all admin functions</li>
          </ul>
        </div>
      </div>

      {/* Change own password */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2"><Key className="w-4 h-4" /> Change Your Password</h3>
          <button onClick={() => setShowPw(v => !v)} className="btn-ghost btn-sm">Change</button>
        </div>
        {showPw && (
          <form onSubmit={changePw} className="space-y-3 bg-stone-700/40 rounded-lg p-4">
            <div>
              <label className="label">Current Password</label>
              <input type="password" className="input" value={pwForm.currentPassword}
                onChange={e => setPwForm(f => ({...f, currentPassword: e.target.value}))} required />
            </div>
            <div>
              <label className="label">New Password</label>
              <input type="password" className="input" value={pwForm.newPassword}
                onChange={e => setPwForm(f => ({...f, newPassword: e.target.value}))} required minLength={8} />
            </div>
            <div>
              <label className="label">Confirm New Password</label>
              <input type="password" className="input" value={pwForm.confirm}
                onChange={e => setPwForm(f => ({...f, confirm: e.target.value}))} required />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary">Update Password</button>
              <button type="button" onClick={() => setShowPw(false)} className="btn-ghost">Cancel</button>
            </div>
          </form>
        )}
      </div>

      {/* Deployment info */}
      <div className="card space-y-2 text-sm text-stone-400">
        <h3>Deployment</h3>
        <p>Backend: <code className="bg-stone-700 px-1 rounded text-stone-300">NODE_ENV, PORT, JWT_SECRET, DB_PATH, CLIENT_URL</code></p>
        <p>Database: SQLite at <code className="bg-stone-700 px-1 rounded text-stone-300">./data/campaign.db</code></p>
        <p>Run <code className="bg-stone-700 px-1 rounded text-stone-300">npm run seed</code> in <code className="bg-stone-700 px-1 rounded text-stone-300">/server</code> to seed PSAs and default GM account.</p>
      </div>
    </div>
  );
}
