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
import { WorkoutSessionPageV2 } from './pages/WorkoutSessionPageV2';
import { WorkoutsPageV2 } from './pages/WorkoutsPageV2';

function AuthenticatedApp() {
  const { session, loading } = useAuth();
  if (loading) return <div className="splash"><div className="brand-mark large">MB</div><p>Cargando Modo Brígido…</p></div>;
  if (!session) return <AuthPage />;
  return <HashRouter><Routes><Route element={<Layout />}>
    <Route path="/" element={<TodayPage />} />
    <Route path="/entreno" element={<WorkoutsPageV2 />} />
    <Route path="/sesion/:id" element={<WorkoutSessionPageV2 />} />
    <Route path="/rutinas" element={<RoutineEditorPage />} />
    <Route path="/nutricion" element={<NutritionPage />} />
    <Route path="/progreso" element={<ProgressPage />} />
    <Route path="/ajustes" element={<SettingsPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Route></Routes></HashRouter>;
}

export default function App() { if (!getAppConfig()) return <SetupPage />; return <AuthProvider><AuthenticatedApp /></AuthProvider>; }
