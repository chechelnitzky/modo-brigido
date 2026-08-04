import { ArrowLeft, Check, CheckCircle2, Dumbbell, RefreshCw, Save, Search, TimerReset } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Modal } from '../components/Modal';
import { getSupabase } from '../lib/supabase';
import type { Exercise } from '../types';

export function WorkoutSessionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const supabase = getSupabase();
  const [session, setSession] = useState<any>(null);
  const [library, setLibrary] = useState<Exercise[]>([]);
  const [replaceTarget, setReplaceTarget] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    if (!id) return;
    const { data, error: loadError } = await supabase.from('workout_sessions').select(`
      id,session_date,started_at,finished_at,notes,
      routine:routine_templates(name),
      workout_exercises(
        id,position,exercise_id,planned_routine_exercise_id,
        exercise:exercise_library(id,slug,name,category,primary_muscle,pattern,equipment),
        planned:routine_exercises(target_sets,rep_min,rep_max,rir_target),
        workout_sets(id,set_number,weight_kg,reps,rir,completed)
      )
    `).eq('id', id).single();
    if (loadError) setError(loadError.message);
    if (data) {
      const next: any = data;
      next.workout_exercises = [...(next.workout_exercises ?? [])].sort((a: any, b: any) => a.position - b.position).map((item: any) => ({
        ...item,
        workout_sets: [...(item.workout_sets ?? [])].sort((a: any, b: any) => a.set_number - b.set_number)
      }));
      setSession(next);
    }
  };

  useEffect(() => { load(); }, [id]);

  const loadLibrary = async (target: any) => {
    setReplaceTarget(target);
    if (!library.length) {
      const { data } = await supabase.from('exercise_library').select('*').order('name');
      setLibrary((data ?? []) as Exercise[]);
    }
  };

  const filteredLibrary = useMemo(() => {
    const query = search.toLowerCase();
    return library.filter((exercise) => !query || `${exercise.name} ${exercise.primary_muscle} ${exercise.equipment}`.toLowerCase().includes(query));
  }, [library, search]);

  const editSetLocal = (exerciseId: string, setId: string, field: string, value: string | boolean) => {
    setSession((current: any) => ({
      ...current,
      workout_exercises: current.workout_exercises.map((exercise: any) => exercise.id === exerciseId ? {
        ...exercise,
        workout_sets: exercise.workout_sets.map((set: any) => set.id === setId ? { ...set, [field]: value === '' ? null : value } : set)
      } : exercise)
    }));
  };

  const saveSet = async (set: any) => {
    setSaving(true);
    const { error: saveError } = await supabase.from('workout_sets').update({
      weight_kg: set.weight_kg === null || set.weight_kg === '' ? null : Number(set.weight_kg),
      reps: set.reps === null || set.reps === '' ? null : Number(set.reps),
      rir: set.rir === null || set.rir === '' ? null : Number(set.rir),
      completed: Boolean(set.completed)
    }).eq('id', set.id);
    if (saveError) setError(saveError.message);
    setSaving(false);
  };

  const toggleComplete = async (exerciseId: string, set: any) => {
    editSetLocal(exerciseId, set.id, 'completed', !set.completed);
    await supabase.from('workout_sets').update({ completed: !set.completed }).eq('id', set.id);
  };

  const addSet = async (exercise: any) => {
    const nextNumber = (exercise.workout_sets.at(-1)?.set_number ?? 0) + 1;
    await supabase.from('workout_sets').insert({ workout_exercise_id: exercise.id, set_number: nextNumber, completed: false });
    await load();
  };

  const replaceExercise = async (exercise: Exercise, permanent: boolean) => {
    if (!replaceTarget) return;
    setSaving(true);
    await supabase.from('workout_exercises').update({ exercise_id: exercise.id }).eq('id', replaceTarget.id);
    if (permanent && replaceTarget.planned_routine_exercise_id) {
      await supabase.from('routine_exercises').update({ exercise_id: exercise.id }).eq('id', replaceTarget.planned_routine_exercise_id);
    }
    setReplaceTarget(null);
    setSearch('');
    await load();
    setSaving(false);
  };

  const finish = async () => {
    if (!id) return;
    await supabase.from('workout_sessions').update({ finished_at: new Date().toISOString() }).eq('id', id);
    navigate('/entreno');
  };

  if (!session) return <div className="page-loading">Preparando entrenamiento…</div>;

  return (
    <div className="page-grid workout-session-page">
      <section className="session-header"><button className="icon-button" onClick={() => navigate('/entreno')}><ArrowLeft /></button><div><p className="eyebrow">SESIÓN ACTIVA</p><h1>{session.routine?.name || 'Entrenamiento'}</h1><p className="muted">{session.session_date} · Los cambios pueden ser solo hoy o permanentes.</p></div><span className="status-chip">{saving ? 'Guardando…' : 'En línea'}</span></section>
      {error && <div className="alert error">{error}</div>}

      <section className="exercise-stack">
        {session.workout_exercises.map((exercise: any) => (
          <article className="panel exercise-panel" key={exercise.id}>
            <div className="exercise-title"><div className="metric-icon"><Dumbbell /></div><div><span>{exercise.exercise.primary_muscle} · {exercise.exercise.equipment}</span><h2>{exercise.exercise.name}</h2><small>Objetivo: {exercise.planned?.target_sets ?? exercise.workout_sets.length} × {exercise.planned?.rep_min ?? 8}–{exercise.planned?.rep_max ?? 12} · RIR {exercise.planned?.rir_target ?? 2}</small></div><button className="secondary-button compact" onClick={() => loadLibrary(exercise)}><RefreshCw size={15} /> Cambiar</button></div>
            <div className="sets-table">
              <div className="sets-head"><span>Serie</span><span>Kg</span><span>Reps</span><span>RIR</span><span>OK</span></div>
              {exercise.workout_sets.map((set: any) => (
                <div className={set.completed ? 'set-row completed' : 'set-row'} key={set.id}>
                  <strong>{set.set_number}</strong>
                  <input inputMode="decimal" type="number" step="0.5" value={set.weight_kg ?? ''} onChange={(e) => editSetLocal(exercise.id, set.id, 'weight_kg', e.target.value)} onBlur={() => saveSet(exercise.workout_sets.find((item: any) => item.id === set.id))} />
                  <input inputMode="numeric" type="number" value={set.reps ?? ''} onChange={(e) => editSetLocal(exercise.id, set.id, 'reps', e.target.value)} onBlur={() => saveSet(exercise.workout_sets.find((item: any) => item.id === set.id))} />
                  <input inputMode="numeric" type="number" min="0" max="5" value={set.rir ?? ''} onChange={(e) => editSetLocal(exercise.id, set.id, 'rir', e.target.value)} onBlur={() => saveSet(exercise.workout_sets.find((item: any) => item.id === set.id))} />
                  <button className={set.completed ? 'set-check active' : 'set-check'} onClick={() => toggleComplete(exercise.id, set)}><Check size={17} /></button>
                </div>
              ))}
            </div>
            <button className="link-button inline" onClick={() => addSet(exercise)}>+ Agregar serie</button>
          </article>
        ))}
      </section>

      <div className="sticky-finish"><div><TimerReset /><span>Los datos se guardan al salir de cada campo.</span></div><button className="primary-button" onClick={finish}><CheckCircle2 /> Finalizar entrenamiento</button></div>

      {replaceTarget && (
        <Modal title={`Cambiar ${replaceTarget.exercise.name}`} onClose={() => setReplaceTarget(null)}>
          <div className="search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar ejercicio, músculo o máquina" /></div>
          <p className="muted small">El botón verde cambia solamente esta sesión. “Permanente” modifica la rutina para los próximos días.</p>
          <div className="library-list">
            {filteredLibrary.map((exercise) => (
              <div className="library-item" key={exercise.id}><div><strong>{exercise.name}</strong><span>{exercise.primary_muscle} · {exercise.equipment}</span></div><div><button className="secondary-button compact" onClick={() => replaceExercise(exercise, false)}>Solo hoy</button><button className="primary-button compact" onClick={() => replaceExercise(exercise, true)}><Save size={14} /> Permanente</button></div></div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
