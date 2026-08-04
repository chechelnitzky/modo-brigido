import { CalendarDays, CheckCircle2, ChevronRight, Dumbbell, Play, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { dateInTimezone } from '../lib/date';
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
    const [{ data: routineData, error: routineError }, { data: sessionData }] = await Promise.all([
      supabase.from('routine_templates').select(`
        id,name,day_order,
        routine_exercises(id,position,target_sets,rep_min,rep_max,rir_target,
          exercise:exercise_library(id,name,primary_muscle,equipment))
      `).eq('user_id', user.id).order('day_order'),
      supabase.from('workout_sessions').select('id,routine_id,session_date,finished_at').eq('user_id', user.id).order('session_date', { ascending: false }).limit(20)
    ]);
    if (routineError) setError(routineError.message);
    const sorted = ((routineData ?? []) as unknown as Routine[]).map((routine) => ({
      ...routine,
      routine_exercises: [...(routine.routine_exercises ?? [])].sort((a, b) => a.position - b.position)
    }));
    setRoutines(sorted);
    setSessions(sessionData ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const startRoutine = async (routine: Routine) => {
    if (!user || !profile) return;
    setStarting(routine.id);
    setError('');
    const sessionDate = dateInTimezone(profile.timezone);
    const { data: session, error: sessionError } = await supabase.from('workout_sessions').insert({
      user_id: user.id,
      routine_id: routine.id,
      session_date: sessionDate,
      started_at: new Date().toISOString()
    }).select().single();

    if (sessionError || !session) {
      setError(sessionError?.message || 'No se pudo iniciar la sesión.');
      setStarting(null);
      return;
    }

    const exerciseRows = routine.routine_exercises.map((item) => ({
      session_id: session.id,
      planned_routine_exercise_id: item.id,
      exercise_id: item.exercise.id,
      position: item.position
    }));
    const { data: workoutExercises, error: exerciseError } = await supabase.from('workout_exercises').insert(exerciseRows).select();
    if (exerciseError || !workoutExercises) {
      setError(exerciseError?.message || 'No se pudieron crear los ejercicios.');
      setStarting(null);
      return;
    }

    const targetByPlanned = new Map(routine.routine_exercises.map((item) => [item.id, item.target_sets]));
    const setRows = workoutExercises.flatMap((item: any) => Array.from({ length: targetByPlanned.get(item.planned_routine_exercise_id) ?? 3 }, (_, index) => ({
      workout_exercise_id: item.id,
      set_number: index + 1,
      completed: false
    })));
    if (setRows.length) await supabase.from('workout_sets').insert(setRows);
    navigate(`/sesion/${session.id}`);
  };

  if (loading) return <div className="page-loading">Cargando tus rutinas…</div>;

  return (
    <div className="page-grid">
      <section className="page-heading simple"><div><p className="eyebrow">ENTRENAMIENTO</p><h1>Push · Pull · Legs</h1><p className="muted">Seis días disponibles, pero al principio gana por consistencia, no por destrucción.</p></div><button className="secondary-button" onClick={load}><RefreshCw size={17} /> Actualizar</button></section>
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
