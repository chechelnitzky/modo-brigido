import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AuthProvider, useAuth } from './context/AuthContext';
import { getAppConfig } from './lib/config';
import { AuthPage } from './pages/AuthPage';
import { NutritionPage } from './pages/NutritionPage';
import { ProgressPage } from './pages/ProgressPage';
import { RoutineEditorPage } from './pages/RoutineEditorPage';
import { SettingsPage } from './pages/SettingsPage';
import { SetupPage } from './pages/SetupPage';
import { TodayPage } from './pages/TodayPage';
import { WorkoutSessionPage } from './pages/WorkoutSessionPage';
import { WorkoutsPage } from './pages/WorkoutsPage';

function AuthenticatedApp() {
  const { session, loading } = useAuth();
  if (loading) return <div className="splash"><div className="brand-mark large">MB</div><p>Cargando Modo Brígido…</p></div>;
  if (!session) return <AuthPage />;
  return <HashRouter><Routes><Route element={<Layout />}>
    <Route path="/" element={<TodayPage />} />
    <Route path="/entreno" element={<WorkoutsPage />} />
    <Route path="/sesion/:id" element={<WorkoutSessionPage />} />
    <Route path="/rutinas" element={<RoutineEditorPage />} />
    <Route path="/nutricion" element={<NutritionPage />} />
    <Route path="/progreso" element={<ProgressPage />} />
    <Route path="/ajustes" element={<SettingsPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Route></Routes></HashRouter>;
}

export default function App() { if (!getAppConfig()) return <SetupPage />; return <AuthProvider><AuthenticatedApp /></AuthProvider>; }
