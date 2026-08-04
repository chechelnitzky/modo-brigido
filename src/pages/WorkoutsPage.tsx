import { CalendarDays, CheckCircle2, ChevronRight, CloudOff, Dumbbell, Play, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { dateInTimezone } from '../lib/date';
import { cacheKeys, cacheSessionSummary, getCached, queueMutation, setCached, syncPendingMutations } from '../lib/offline';
import { getSupabase } from '../lib/supabase';

type Routine = {
  id: string;
  name: string;
  day_order: number;
  routine_exercises: Array<{
    id: string;
    position: number;
    target_sets: number;
    rep_min: number;
    rep_max: number;
    rir_target: number;
    exercise: { id: number; name: string; primary_muscle: string; equipment: string };
  }>;
};

export function WorkoutsPage() {
  const supabase = getSupabase();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    const [cachedRoutines, cachedSessions] = await Promise.all([
      getCached<Routine[]>(cacheKeys.routines(user.id)),
      getCached<any[]>(cacheKeys.sessions(user.id))
    ]);
    if (cachedRoutines) setRoutines(cachedRoutines);
    if (cachedSessions) setSessions(cachedSessions);
    setLoading(false);
    if (!navigator.onLine) {
      if (!cachedRoutines?.length) setError('Conéctate una vez para descargar tus rutinas a este dispositivo.');
      return;
    }

    const [{ data: routineData, error: routineError }, { data: sessionData }] = await Promise.all([
      supabase.from('routine_templates').select(`
        id,name,day_order,
        routine_exercises(id,position,target_sets,rep_min,rep_max,rir_target,
          exercise:exercise_library(id,name,primary_muscle,equipment))
      `).eq('user_id', user.id).order('day_order'),
      supabase.from('workout_sessions').select('id,routine_id,session_date,finished_at,started_at').eq('user_id', user.id).order('session_date', { ascending: false }).limit(20)
    ]);
    if (routineError) {
      if (!cachedRoutines?.length) setError(routineError.message);
      return;
    }
    const sorted = ((routineData ?? []) as unknown as Routine[]).map((routine) => ({
      ...routine,
      routine_exercises: [...(routine.routine_exercises ?? [])].sort((a, b) => a.position - b.position)
    }));
    setRoutines(sorted);
    setSessions(sessionData ?? []);
    await Promise.all([
      setCached(cacheKeys.routines(user.id), sorted),
      setCached(cacheKeys.sessions(user.id), sessionData ?? [])
    ]);
  };

  useEffect(() => { void load(); }, [user]);

  const startRoutine = async (routine: Routine) => {
    if (!user || !profile) return;
    setStarting(routine.id);
    setError('');
    const sessionId = crypto.randomUUID();
    const sessionDate = dateInTimezone(profile.timezone);
    const startedAt = new Date().toISOString();

    const workoutExercises = routine.routine_exercises.map((item) => ({
      id: crypto.randomUUID(),
      session_id: sessionId,
      planned_routine_exercise_id: item.id,
      exercise_id: item.exercise.id,
      position: item.position,
      exercise: item.exercise,
      planned: {
        target_sets: item.target_sets,
        rep_min: item.rep_min,
        rep_max: item.rep_max,
        rir_target: item.rir_target
      },
      workout_sets: Array.from({ length: item.target_sets }, (_, index) => ({
        id: crypto.randomUUID(),
        set_number: index + 1,
        weight_kg: null,
        reps: null,
        rir: null,
        completed: false
      }))
    }));

    const localSession = {
      id: sessionId,
      user_id: user.id,
      routine_id: routine.id,
      session_date: sessionDate,
      started_at: startedAt,
      finished_at: null,
      notes: null,
      routine: { name: routine.name },
      workout_exercises: workoutExercises
    };

    await Promise.all([
      setCached(cacheKeys.workoutSession(sessionId), localSession),
      cacheSessionSummary(user.id, { id: sessionId, routine_id: routine.id, session_date: sessionDate, started_at: startedAt, finished_at: null })
    ]);

    await queueMutation({
      operation: 'upsert', table: 'workout_sessions', dedupeKey: `session:${sessionId}`,
      payload: { id: sessionId, user_id: user.id, routine_id: routine.id, session_date: sessionDate, started_at: startedAt, finished_at: null, notes: null }
    });
    await queueMutation({
      operation: 'upsert', table: 'workout_exercises', dedupeKey: `session-exercises:${sessionId}`,
      payload: workoutExercises.map((item) => ({
        id: item.id, session_id: sessionId, planned_routine_exercise_id: item.planned_routine_exercise_id,
        exercise_id: item.exercise_id, position: item.position
      }))
    });
    await queueMutation({
      operation: 'upsert', table: 'workout_sets', dedupeKey: `session-sets:${sessionId}`,
      payload: workoutExercises.flatMap((exercise) => exercise.workout_sets.map((set) => ({
        ...set, workout_exercise_id: exercise.id
      })))
    });
    if (navigator.onLine) void syncPendingMutations();
    navigate(`/sesion/${sessionId}`);
  };

  if (loading) return <div className="page-loading">Cargando tus rutinas…</div>;

  return (
    <div className="page-grid">
      <section className="page-heading simple"><div><p className="eyebrow">ENTRENAMIENTO</p><h1>Push · Pull · Legs</h1><p className="muted">Seis días disponibles, pero al principio gana por consistencia, no por destrucción.</p></div><button className="secondary-button" onClick={load}><RefreshCw size={17} /> Actualizar</button></section>
      {!navigator.onLine && <div className="alert success"><CloudOff size={16} /> Modo offline: puedes iniciar y registrar una rutina descargada. Se sincronizará al volver internet.</div>}
      {error && <div className="alert error">{error}</div>}
      <section className="routine-grid">
        {routines.map((routine) => {
          const last = sessions.find((session) => session.routine_id === routine.id);
          return (
            <article className="routine-card" key={routine.id}>
              <div className="routine-card-top"><div className="metric-icon"><Dumbbell /></div><div><span>Rutina {routine.day_order}</span><h2>{routine.name}</h2></div>{last?.finished_at ? <span className="status-chip green"><CheckCircle2 size={14} /> Hecha</span> : <span className="status-chip">Próxima</span>}</div>
              <ol>{routine.routine_exercises.map((item) => <li key={item.id}><span>{item.exercise.name}</span><small>{item.target_sets} × {item.rep_min}–{item.rep_max}</small></li>)}</ol>
              {last && <p className="last-session"><CalendarDays size={15} /> Última: {last.session_date}</p>}
              <button className="primary-button" onClick={() => startRoutine(routine)} disabled={starting === routine.id}><Play size={17} /> {starting === routine.id ? 'Preparando…' : 'Iniciar rutina'} <ChevronRight size={17} /></button>
            </article>
          );
        })}
      </section>
    </div>
  );
}
