import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/layout/Navbar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import MyPilots from './pages/MyPilots';
import PilotDetail from './pages/PilotDetail';
import MyUnits from './pages/MyUnits';
import UnitDetail from './pages/UnitDetail';
import RepairQueue from './pages/RepairQueue';
import UnitRoster from './pages/UnitRoster';
import Contracts from './pages/Contracts';
import SessionDetail from './pages/SessionDetail';
import PlayMode from './pages/PlayMode';
import Salvage from './pages/Salvage';
import Accounting from './pages/Accounting';
import Admin from './pages/Admin';

function RequireAuth({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen text-stone-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen text-stone-400">Loading…</div>;

  return (
    <div className="min-h-screen bg-stone-900 text-stone-100">
      {user && <Navbar />}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />

          <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />

          <Route path="/pilots" element={<RequireAuth><MyPilots /></RequireAuth>} />
          <Route path="/pilots/:id" element={<RequireAuth><PilotDetail /></RequireAuth>} />

          <Route path="/units" element={<RequireAuth><MyUnits /></RequireAuth>} />
          <Route path="/units/:id" element={<RequireAuth><UnitDetail /></RequireAuth>} />

          <Route path="/repairs" element={
            <RequireAuth roles={['technician','quartermaster','gm']}>
              <RepairQueue />
            </RequireAuth>
          } />

          <Route path="/roster" element={
            <RequireAuth roles={['quartermaster','gm']}>
              <UnitRoster />
            </RequireAuth>
          } />

          <Route path="/contracts" element={
            <RequireAuth roles={['gm','quartermaster']}>
              <Contracts />
            </RequireAuth>
          } />
          <Route path="/contracts/sessions/:id" element={
            <RequireAuth roles={['gm','quartermaster']}>
              <SessionDetail />
            </RequireAuth>
          } />

          <Route path="/play/:sessionId" element={
            <RequireAuth roles={['gm']}>
              <PlayMode />
            </RequireAuth>
          } />

          <Route path="/salvage/:sessionId" element={
            <RequireAuth roles={['gm','quartermaster']}>
              <Salvage />
            </RequireAuth>
          } />

          <Route path="/accounting" element={
            <RequireAuth roles={['gm','quartermaster']}>
              <Accounting />
            </RequireAuth>
          } />

          <Route path="/admin" element={
            <RequireAuth roles={['gm']}>
              <Admin />
            </RequireAuth>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: '#292524', color: '#e7e5e4', border: '1px solid #44403c' },
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
