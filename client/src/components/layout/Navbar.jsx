import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Shield, Users, Wrench, BookOpen, Sword, Coins, Settings, LogOut, Bell } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';

export default function Navbar() {
  const { user, logout, isGM, isQM, isTechnician } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unread, setUnread]   = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifs, setNotifs]   = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const list = await api.notifications.list();
        setNotifs(list);
        setUnread(list.filter(n => !n.read).length);
      } catch {}
    };
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const markRead = async (id) => {
    await api.notifications.read(id);
    setNotifs(n => n.map(x => x.id === id ? { ...x, read: 1 } : x));
    setUnread(u => Math.max(0, u - 1));
  };

  const markAll = async () => {
    await api.notifications.readAll();
    setNotifs(n => n.map(x => ({ ...x, read: 1 })));
    setUnread(0);
  };

  const navLink = (to, icon, label) => (
    <Link
      to={to}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors
        ${location.pathname.startsWith(to) && to !== '/'
          ? 'bg-amber-900/40 text-amber-300'
          : 'text-stone-400 hover:text-stone-100 hover:bg-stone-700'}`}
    >
      {icon}{label}
    </Link>
  );

  return (
    <nav className="bg-stone-800 border-b border-stone-700 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-1">
          <Link to="/" className="flex items-center gap-2 mr-4">
            <Shield className="w-6 h-6 text-amber-500" />
            <span className="font-bold text-amber-400 hidden sm:block">Alpha Strike</span>
          </Link>
          {navLink('/pilots', <Users className="w-4 h-4" />, 'Pilots')}
          {navLink('/units',  <Shield className="w-4 h-4" />, 'Units')}
          {isTechnician && navLink('/repairs', <Wrench className="w-4 h-4" />, 'Repairs')}
          {isQM && navLink('/roster', <BookOpen className="w-4 h-4" />, 'Roster')}
          {isQM && navLink('/contracts', <Sword className="w-4 h-4" />, 'Contracts')}
          {isQM && navLink('/accounting', <Coins className="w-4 h-4" />, 'Ledger')}
          {isGM && navLink('/admin', <Settings className="w-4 h-4" />, 'Admin')}
        </div>

        <div className="flex items-center gap-2">
          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setShowNotifs(v => !v)}
              className="relative p-2 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-700"
            >
              <Bell className="w-5 h-5" />
              {unread > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-600 rounded-full text-[10px] flex items-center justify-center text-white font-bold">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>

            {showNotifs && (
              <div className="absolute right-0 top-full mt-1 w-80 bg-stone-800 border border-stone-700 rounded-xl shadow-xl z-50">
                <div className="flex items-center justify-between px-4 py-3 border-b border-stone-700">
                  <span className="font-semibold text-sm">Notifications</span>
                  {unread > 0 && (
                    <button onClick={markAll} className="text-xs text-amber-400 hover:text-amber-300">
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifs.length === 0 && (
                    <p className="text-stone-500 text-sm text-center py-6">No notifications</p>
                  )}
                  {notifs.map(n => (
                    <div
                      key={n.id}
                      className={`px-4 py-3 border-b border-stone-700/50 hover:bg-stone-700/50 cursor-pointer ${!n.read ? 'bg-stone-700/30' : ''}`}
                      onClick={() => markRead(n.id)}
                    >
                      <div className="flex items-start gap-2">
                        {!n.read && <span className="w-2 h-2 mt-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
                        <div className={!n.read ? '' : 'ml-4'}>
                          <p className="text-sm font-medium text-stone-200">{n.title}</p>
                          {n.body && <p className="text-xs text-stone-400 mt-0.5">{n.body}</p>}
                          <p className="text-xs text-stone-500 mt-1">
                            {new Date(n.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <span className="text-xs text-stone-500 hidden sm:block">
            {user?.username} · <span className="capitalize text-stone-400">{user?.role}</span>
          </span>
          <button onClick={handleLogout} className="p-2 rounded-lg text-stone-400 hover:text-red-400 hover:bg-stone-700">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </nav>
  );
}
