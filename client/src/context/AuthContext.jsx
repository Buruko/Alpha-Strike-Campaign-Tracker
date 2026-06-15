import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [player, setPlayer]   = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.auth.me();
      setUser(data.user);
      setPlayer(data.player);
    } catch {
      setUser(null);
      setPlayer(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (username, password) => {
    const data = await api.auth.login({ username, password });
    setUser(data.user);
    await refresh();
    return data.user;
  };

  const logout = async () => {
    await api.auth.logout();
    setUser(null);
    setPlayer(null);
  };

  const isGM           = user?.role === 'gm';
  const isQM           = user?.role === 'quartermaster' || isGM;
  const isTechnician   = user?.role === 'technician' || isGM;
  const isPlayer       = user?.role === 'player';
  const canManageUnits = isQM;
  const canRepair      = isTechnician;

  return (
    <AuthContext.Provider value={{
      user, player, loading,
      login, logout, refresh,
      isGM, isQM, isTechnician, isPlayer,
      canManageUnits, canRepair,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
