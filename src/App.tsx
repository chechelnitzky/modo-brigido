import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { FatSecretAutoSync } from './components/FatSecretAutoSync';
import { Layout } from './components/Layout';
import { PacerAutoSync } from './components/PacerAutoSync';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SelectedDateProvider } from './context/SelectedDateContext';
import { getAppConfig } from './lib/config';
import { AuthPage } from './pages/AuthPage';
import { ExerciseLibraryPage } from './pages/ExerciseLibraryPage';
import { NutritionPage } from './pages/NutritionPage';
import { ProgressPage } from './pages/ProgressPage';
import { RoutineEditorPage } from './pages/RoutineEditorPage';
import { SettingsPage } from './pages/SettingsPage';
import { SetupPage } from './pages/SetupPage';
import { TodayPage } from './pages/TodayPage';
import { WorkoutSessionPageV2 } from './pages/WorkoutSessionPageV2';
import { WorkoutsPageV2 } from './pages/WorkoutsPageV2';
import './nutrition-builder.css';
import './nutrition-cleanup.css';

function AuthenticatedApp() {
  const { session, loading } = useAuth();
  if (loading) return <div className="splash"><div className="brand-mark large">MB</div><p>Cargando Modo Brígido…</p></div>;
  if (!session) return <AuthPage />;
  return (
    <SelectedDateProvider>
      <PacerAutoSync />
      <FatSecretAutoSync />
      <HashRouter><Routes><Route element={<Layout />}>
        <Route path="/" element={<TodayPage />} />
        <Route path="/entreno" element={<WorkoutsPageV2 />} />
        <Route path="/sesion/:id" element={<WorkoutSessionPageV2 />} />
        <Route path="/rutinas" element={<RoutineEditorPage />} />
        <Route path="/biblioteca" element={<ExerciseLibraryPage />} />
        <Route path="/nutricion" element={<NutritionPage />} />
        <Route path="/progreso" element={<ProgressPage />} />
        <Route path="/ajustes" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route></Routes></HashRouter>
    </SelectedDateProvider>
  );
}

export default function App() {
  if (!getAppConfig()) return <SetupPage />;
  return <AuthProvider><AuthenticatedApp /></AuthProvider>;
}
