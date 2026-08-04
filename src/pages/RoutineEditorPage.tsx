import { ArrowLeft, CalendarDays, Dumbbell, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExerciseCreator } from '../components/ExerciseCreator';
import { Modal } from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { cacheKeys, getCached, saveMutation, setCached } from '../lib/offline';
import { getSupabase } from '../lib/supabase';
import type { Exercise } from '../types';

type RoutineExercise = { id: string; position: number; target_sets: number; rep_min: number; rep_max: number; rir_target: number; exercise_id: number; exercise: Exercise };
type Routine = { id: string; name: string; day_order: number; routine_exercises: RoutineExercise[] };

function sortRoutines(items: Routine[]) {
  return [...items].sort((a, b) => a.day_order - b.day_order).map((routine) => ({ ...routine, routine_exercises: [...routine.routine_exercises].sort((a, b) => a.position - b.position) }));
}

export function RoutineEditorPage() {
  const supabase = getSupabase();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [library, setLibrary] = useState<Exercise[]>([]);
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const persistLocal = async (next: Routine[]) => { if (!user) return; const sorted = sortRoutines(next); setRoutines(sorted); await setCached(cacheKeys.routines(user.id), sorted); };

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const [cachedRoutines, cachedLibrary] = await Promise.all([getCached<Routine[]>(cacheKeys.routines(user.id)), getCached<Exercise[]>(cacheKeys.exerciseLibrary)]);
      if (cancelled) return;
      const visibleCachedLibrary = (cachedLibrary ?? []).filter((exercise) => !exercise.user_id || exercise.user_id === user.id);
      setRoutines(sortRoutines(cachedRoutines ?? [])); setLibrary(visibleCachedLibrary); setLoading(false);
      if (!navigator.onLine) return;
      const [routineResult, libraryResult] = await Promise.all([
        supabase.from('routine_templates').select(`id,name,day_order,routine_exercises(id,position,target_sets,rep_min,rep_max,rir_target,exercise_id,exercise:exercise_library(id,slug,name,category,primary_muscle,pattern,equipment,user_id))`).eq('user_id', user.id).order('day_order'),
        supabase.from('exercise_library').select('id,slug,name,category,primary_muscle,pattern,equipment,user_id').order('name')
      ]);
      if (cancelled) return;
      if (routineResult.error) { setError(routineResult.error.message); return; }
      const nextRoutines = sortRoutines((routineResult.data ?? []) as unknown as Routine[]);
      const nextLibrary = (libraryResult.data ?? []) as Exercise[];
      setRoutines(nextRoutines); setLibrary(nextLibrary);
      await Promise.all([setCached(cacheKeys.routines(user.id), nextRoutines), setCached(cacheKeys.exerciseLibrary, nextLibrary)]);
    })();
    return () => { cancelled = true; };
  }, [supabase, user]);

  const filteredLibrary = useMemo(() => { const query = search.trim().toLowerCase(); return library.filter((exercise) => !query || `${exercise.name} ${exercise.primary_muscle} ${exercise.equipment} ${exercise.pattern} ${exercise.category}`.toLowerCase().includes(query)); }, [library, search]);
  const updateRoutineLocal = (routineId: string, patch: Partial<Routine>) => { void persistLocal(routines.map((routine) => routine.id === routineId ? { ...routine, ...patch } : routine)); };

  const addDay = async () => {
    if (!user || routines.length >= 7) return;
    const usedOrders = new Set(routines.map((routine) => routine.day_order));
    const dayOrder = [1, 2, 3, 4, 5, 6, 7].find((value) => !usedOrders.has(value)); if (!dayOrder) return;
    const existingNames = new Set(routines.map((routine) => routine.name.toLowerCase())); let index = routines.length + 1; let name = `Rutina ${index}`;
    while (existingNames.has(name.toLowerCase())) name = `Rutina ${++index}`;
    const nextRoutine: Routine = { id: crypto.randomUUID(), name, day_order: dayOrder, routine_exercises: [] };
    await persistLocal([...routines, nextRoutine]);
    await saveMutation({ operation: 'upsert', table: 'routine_templates', payload: { id: nextRoutine.id, user_id: user.id, name, day_order: dayOrder }, dedupeKey: `routine-new:${nextRoutine.id}` });
    setMessage('Día agregado. Puedes llamarlo Full Body, Push, Pierna o como quieras.');
  };

  const saveRoutineName = async (routine: Routine) => {
    const name = routine.name.trim() || `Rutina ${routine.day_order}`; updateRoutineLocal(routine.id, { name });
    await saveMutation({ operation: 'update', table: 'routine_templates', payload: { name, updated_at: new Date().toISOString() }, match: { id: routine.id }, dedupeKey: `routine-name:${routine.id}` });
  };

  const deleteRoutine = async (routine: Routine) => {
    if (!window.confirm(`¿Eliminar ${routine.name} y todos sus ejercicios? Los entrenamientos anteriores no se borran.`)) return;
    await persistLocal(routines.filter((item) => item.id !== routine.id));
    await saveMutation({ operation: 'delete', table: 'routine_templates', match: { id: routine.id }, dedupeKey: `routine-delete:${routine.id}` });
  };

  const updateExerciseLocal = (routineId: string, exerciseId: string, patch: Partial<RoutineExercise>) => { void persistLocal(routines.map((routine) => routine.id === routineId ? { ...routine, routine_exercises: routine.routine_exercises.map((item) => item.id === exerciseId ? { ...item, ...patch } : item) } : routine)); };
  const saveExerciseTargets = async (item: RoutineExercise) => {
    const payload = { target_sets: Math.max(1, Math.min(10, Number(item.target_sets) || 1)), rep_min: Math.max(1, Math.min(100, Number(item.rep_min) || 1)), rep_max: Math.max(1, Math.min(100, Number(item.rep_max) || 1)), rir_target: Math.max(0, Math.min(10, Number(item.rir_target) || 0)), updated_at: new Date().toISOString() };
    await saveMutation({ operation: 'update', table: 'routine_exercises', payload, match: { id: item.id }, dedupeKey: `routine-exercise-target:${item.id}` });
  };
  const removeExercise = async (routineId: string, item: RoutineExercise) => {
    await persistLocal(routines.map((entry) => entry.id === routineId ? { ...entry, routine_exercises: entry.routine_exercises.filter((exercise) => exercise.id !== item.id) } : entry));
    await saveMutation({ operation: 'delete', table: 'routine_exercises', match: { id: item.id }, dedupeKey: `routine-exercise-delete:${item.id}` });
  };
  const addExercise = async (exercise: Exercise) => {
    if (!selectedRoutineId) return;
    const routine = routines.find((item) => item.id === selectedRoutineId); if (!routine) return;
    const position = Math.max(0, ...routine.routine_exercises.map((item) => item.position)) + 1;
    const nextExercise: RoutineExercise = { id: crypto.randomUUID(), position, target_sets: 2, rep_min: 8, rep_max: 12, rir_target: 3, exercise_id: exercise.id, exercise };
    await persistLocal(routines.map((item) => item.id === selectedRoutineId ? { ...item, routine_exercises: [...item.routine_exercises, nextExercise] } : item));
    await saveMutation({ operation: 'upsert', table: 'routine_exercises', payload: { id: nextExercise.id, routine_id: selectedRoutineId, exercise_id: exercise.id, position, target_sets: 2, rep_min: 8, rep_max: 12, rir_target: 3 }, dedupeKey: `routine-exercise-new:${nextExercise.id}` });
    setSelectedRoutineId(null); setSearch('');
  };

  const handleCustomExerciseCreated = (exercise: Exercise) => {
    setLibrary((current) => [...current.filter((item) => item.id !== exercise.id), exercise].sort((a, b) => a.name.localeCompare(b.name, 'es')));
    void addExercise(exercise);
  };

  if (loading) return <div className="page-loading">Cargando editor…</div>;
  return (
    <div className="page-grid">
      <section className="session-header"><button className="icon-button" onClick={() => navigate('/entreno')}><ArrowLeft /></button><div><p className="eyebrow">EDITOR DE PROGRAMA</p><h1>Diseña tu semana</h1><p className="muted">Entre 1 y 7 días, con nombres y ejercicios personalizados.</p></div><span className="status-chip green"><CalendarDays size={14} /> {routines.length} día{routines.length === 1 ? '' : 's'}</span></section>
      {error && <div className="alert error">{error}</div>}{message && <div className="alert success">{message}</div>}
      <section className="editor-toolbar panel"><div><strong>{routines.length}/7 días configurados</strong><p className="muted small">Puedes crear PPL, Full Body, Torso/Pierna o cualquier esquema.</p></div><button className="primary-button" onClick={addDay} disabled={routines.length >= 7}><Plus size={17} /> Agregar día</button></section>
      <section className="routine-editor-stack">
        {routines.map((routine, routineIndex) => <article className="panel routine-editor-card" key={routine.id}>
          <div className="routine-editor-heading"><div className="day-badge">{routineIndex + 1}</div><label>Nombre de la rutina<input value={routine.name} onChange={(event) => updateRoutineLocal(routine.id, { name: event.target.value })} onBlur={() => saveRoutineName(routine)} placeholder="Ej: Full Body A" /></label><button className="danger-button compact" onClick={() => deleteRoutine(routine)}><Trash2 size={15} /> Eliminar día</button></div>
          <div className="routine-exercise-editor">
            {!routine.routine_exercises.length && <div className="editor-empty"><Dumbbell /><span>Este día todavía no tiene ejercicios.</span></div>}
            {routine.routine_exercises.map((item, index) => <div className="routine-exercise-row" key={item.id}>
              <div className="routine-exercise-name"><span>{index + 1}</span><div><strong>{item.exercise.name}</strong><small>{item.exercise.primary_muscle} · {item.exercise.equipment}{item.exercise.user_id ? ' · Personalizado' : ''}</small></div></div>
              <label>Series<input type="number" min="1" max="10" value={item.target_sets} onChange={(event) => updateExerciseLocal(routine.id, item.id, { target_sets: Number(event.target.value) })} onBlur={() => saveExerciseTargets(item)} /></label>
              <label>Reps mín.<input type="number" min="1" max="100" value={item.rep_min} onChange={(event) => updateExerciseLocal(routine.id, item.id, { rep_min: Number(event.target.value) })} onBlur={() => saveExerciseTargets(item)} /></label>
              <label>Reps máx.<input type="number" min="1" max="100" value={item.rep_max} onChange={(event) => updateExerciseLocal(routine.id, item.id, { rep_max: Number(event.target.value) })} onBlur={() => saveExerciseTargets(item)} /></label>
              <label>RIR<input type="number" min="0" max="10" value={item.rir_target} onChange={(event) => updateExerciseLocal(routine.id, item.id, { rir_target: Number(event.target.value) })} onBlur={() => saveExerciseTargets(item)} /></label>
              <button className="icon-button danger-icon" onClick={() => removeExercise(routine.id, item)}><Trash2 size={17} /></button>
            </div>)}
          </div>
          <button className="secondary-button add-exercise-button" onClick={() => setSelectedRoutineId(routine.id)}><Plus size={16} /> Agregar ejercicio</button>
        </article>)}
      </section>
      {selectedRoutineId && <Modal title="Agregar ejercicio" onClose={() => { setSelectedRoutineId(null); setSearch(''); }}>
        <div className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, músculo o máquina" /></div>
        <ExerciseCreator onCreated={handleCustomExerciseCreated} />
        {!library.length && !navigator.onLine && <div className="alert error">La biblioteca no está descargada todavía.</div>}
        <div className="library-list">{filteredLibrary.map((exercise) => <button className="exercise-choice" key={exercise.id} onClick={() => addExercise(exercise)}><div><strong>{exercise.name}</strong><span>{exercise.primary_muscle} · {exercise.equipment}{exercise.user_id ? ' · Personalizado' : ''}</span></div><Plus size={18} /></button>)}</div>
      </Modal>}
    </div>
  );
}
