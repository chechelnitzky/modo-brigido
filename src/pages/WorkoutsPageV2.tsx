import { CalendarDays, CheckCircle2, ChevronRight, CloudOff, Dumbbell, LockKeyhole, Pencil, Play, RefreshCw, RotateCcw, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSelectedDate } from '../context/SelectedDateContext';
import { completedWorkoutDate, prettyDate } from '../lib/date';
import { cacheKeys, cacheSessionSummary, getCached, getSyncStatus, queueMutation, saveMutation, setCached, syncPendingMutations } from '../lib/offline';
import { getSupabase } from '../lib/supabase';

type Routine = { id: string; name: string; day_order: number; routine_exercises: Array<{ id: string; position: number; target_sets: number; rep_min: number; rep_max: number; rir_target: number; exercise: { id: number; name: string; primary_muscle: string; equipment: string } }> };
type PersonalRecord = { exerciseId: number; exerciseName: string; weightKg: number; reps: number; estimatedOneRepMax: number; date: string };

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getWeekRange(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  const sundayOffset = date.getDay();
  const start = new Date(date);
  start.setDate(date.getDate() - sundayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: toDateKey(start), end: toDateKey(end) };
}

function calculatePersonalRecords(rows: any[]): PersonalRecord[] {
  const records = new Map<number, PersonalRecord>();
  for (const session of rows) for (const workoutExercise of session.workout_exercises ?? []) {
    const exercise = Array.isArray(workoutExercise.exercise) ? workoutExercise.exercise[0] : workoutExercise.exercise;
    if (!exercise) continue;
    for (const set of workoutExercise.workout_sets ?? []) {
      const weightKg = Number(set.weight_kg), reps = Number(set.reps);
      if (!set.completed || !Number.isFinite(weightKg) || !Number.isFinite(reps) || weightKg <= 0 || reps <= 0) continue;
      const estimatedOneRepMax = weightKg * (1 + reps / 30);
      const current = records.get(exercise.id);
      if (!current || estimatedOneRepMax > current.estimatedOneRepMax) records.set(exercise.id, { exerciseId: exercise.id, exerciseName: exercise.name, weightKg, reps, estimatedOneRepMax, date: session.session_date });
    }
  }
  return [...records.values()].sort((a, b) => b.estimatedOneRepMax - a.estimatedOneRepMax);
}

function sessionSummary(session: any) {
  return {
    id: session.id,
    routine_id: session.routine_id,
    session_date: session.session_date,
    started_at: session.started_at,
    finished_at: session.finished_at ?? null
  };
}

function mergeSessionSummaries(base: any[], localDrafts: any[]) {
  const byId = new Map<string, any>();
  for (const item of base ?? []) if (item?.id) byId.set(item.id, item);
  for (const draft of localDrafts ?? []) if (draft?.id) byId.set(draft.id, { ...(byId.get(draft.id) ?? {}), ...sessionSummary(draft) });
  return [...byId.values()].sort((a, b) => String(b.started_at ?? '').localeCompare(String(a.started_at ?? '')));
}

function workoutProgressScore(session: any): number {
  if (!session) return -1;
  let score = 0;
  for (const exercise of session.workout_exercises ?? []) {
    for (const set of exercise.workout_sets ?? []) {
      if (set.completed) score += 20;
      if (set.weight_kg !== null && set.weight_kg !== undefined && set.weight_kg !== '') score += 5;
      if (set.reps !== null && set.reps !== undefined && set.reps !== '') score += 5;
      if (set.rir !== null && set.rir !== undefined && set.rir !== '') score += 2;
    }
  }
  return score;
}

function chooseBestDraft(drafts: any[]): any | null {
  const active = drafts.filter((draft) => draft && !draft.finished_at);
  if (!active.length) return null;
  return [...active].sort((a, b) => {
    const scoreDifference = workoutProgressScore(b) - workoutProgressScore(a);
    if (scoreDifference !== 0) return scoreDifference;
    return String(a.started_at ?? '').localeCompare(String(b.started_at ?? ''));
  })[0] ?? null;
}

export function WorkoutsPageV2() {
  const supabase = getSupabase();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { selectedDate, isToday, resetToToday } = useSelectedDate();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [weekSessions, setWeekSessions] = useState<any[]>([]);
  const [activeSessions, setActiveSessions] = useState<Record<string, any>>({});
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [updatingSession, setUpdatingSession] = useState<string | null>(null);
  const [error, setError] = useState('');
  const weekRange = getWeekRange(selectedDate);
  const sessionCacheKey = user ? `sessions:${user.id}:${selectedDate}` : `sessions:anonymous:${selectedDate}`;
  const weekSessionCacheKey = user ? `sessions-week:${user.id}:${weekRange.start}` : `sessions-week:anonymous:${weekRange.start}`;

  const persistSelectedDateSessions = async (next: any[]) => {
    setSessions(next);
    await setCached(sessionCacheKey, next);
  };

  const persistWeekSessions = async (next: any[]) => {
    setWeekSessions(next);
    await setCached(weekSessionCacheKey, next);
  };

  const readPermanentDrafts = () => {
    const drafts: any[] = [];
    if (!user) return drafts;
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith('modo-brigido-session-draft:')) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(key) ?? '{}');
        const draft = parsed?.session;
        if (!draft?.id || !draft?.routine_id || !draft?.session_date) continue;
        if (draft.user_id && draft.user_id !== user.id) continue;
        drafts.push(draft);
      } catch {
        // Un borrador dañado no debe impedir recuperar los demás.
      }
    }
    return drafts;
  };

  const readActiveSessionCopies = async (sessionList: any[], knownDrafts = readPermanentDrafts()) => {
    const draftById = new Map(knownDrafts.map((draft) => [draft.id, draft]));
    const entries = await Promise.all(sessionList.filter((session) => !session.finished_at).map(async (session) => {
      const draft = draftById.get(session.id) ?? null;
      const cached = await getCached<any>(cacheKeys.workoutSession(session.id));
      return [session.id, draft ?? cached] as const;
    }));
    return Object.fromEntries(entries.filter((entry) => Boolean(entry[1])));
  };

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    const permanentDrafts = readPermanentDrafts();
    const draftsThisWeek = permanentDrafts.filter((draft) => draft.session_date >= weekRange.start && draft.session_date <= weekRange.end);
    const [cachedRoutines, cachedDateSessions, cachedWeekSessions, cachedAllSessions, cachedRecords] = await Promise.all([
      getCached<Routine[]>(cacheKeys.routines(user.id)),
      getCached<any[]>(sessionCacheKey),
      getCached<any[]>(weekSessionCacheKey),
      getCached<any[]>(cacheKeys.sessions(user.id)),
      getCached<PersonalRecord[]>(`personal-records:${user.id}`)
    ]);
    const cachedWeekBase = cachedWeekSessions ?? (cachedAllSessions ?? []).filter((session) => session.session_date >= weekRange.start && session.session_date <= weekRange.end);
    const fallbackWeekSessions = mergeSessionSummaries(cachedWeekBase, draftsThisWeek);
    const fallbackSessions = mergeSessionSummaries(cachedDateSessions ?? fallbackWeekSessions.filter((session) => session.session_date === selectedDate), draftsThisWeek.filter((draft) => draft.session_date === selectedDate));
    const cachedActiveSessions = await readActiveSessionCopies(fallbackSessions, permanentDrafts);
    if (cachedRoutines) setRoutines(cachedRoutines);
    setSessions(fallbackSessions);
    setWeekSessions(fallbackWeekSessions);
    setActiveSessions(cachedActiveSessions);
    if (cachedRecords) setRecords(cachedRecords);
    setLoading(false);

    if (!navigator.onLine) {
      if (!cachedRoutines?.length) setError('Conéctate una vez para descargar tus rutinas a este dispositivo.');
      return;
    }

    await syncPendingMutations();
    const hasPendingChanges = getSyncStatus().pending > 0;

    const [routineResult, sessionResult, recordResult] = await Promise.all([
      supabase.from('routine_templates').select(`id,name,day_order,routine_exercises(id,position,target_sets,rep_min,rep_max,rir_target,exercise:exercise_library(id,name,primary_muscle,equipment))`).eq('user_id', user.id).order('day_order'),
      supabase.from('workout_sessions').select(`id,routine_id,session_date,finished_at,started_at,workout_exercises(id,position,exercise_id,planned_routine_exercise_id,exercise:exercise_library(id,name,primary_muscle,equipment),planned:routine_exercises(target_sets,rep_min,rep_max,rir_target))`).eq('user_id', user.id).gte('session_date', weekRange.start).lte('session_date', weekRange.end).order('started_at', { ascending: false }),
      supabase.from('workout_sessions').select(`session_date,workout_exercises(exercise:exercise_library(id,name),workout_sets(weight_kg,reps,completed))`).eq('user_id', user.id).not('finished_at', 'is', null).order('session_date', { ascending: false }).limit(100)
    ]);

    if (routineResult.error) {
      if (!cachedRoutines?.length) setError(routineResult.error.message);
      return;
    }

    const remoteRoutines = ((routineResult.data ?? []) as unknown as Routine[]).map((routine) => ({ ...routine, routine_exercises: [...(routine.routine_exercises ?? [])].sort((a, b) => a.position - b.position) }));
    const nextRoutines = hasPendingChanges && cachedRoutines?.length ? cachedRoutines : remoteRoutines;
    const remoteWeekSessions = sessionResult.data ?? [];
    const nextWeekSessions = mergeSessionSummaries(remoteWeekSessions, draftsThisWeek);
    const nextSessions = nextWeekSessions.filter((session) => session.session_date === selectedDate);
    const localActiveSessions = await readActiveSessionCopies(nextSessions, permanentDrafts);
    const remoteActiveSessions = Object.fromEntries(remoteWeekSessions
      .filter((session) => session.session_date === selectedDate && !session.finished_at && session.workout_exercises?.length)
      .map((session) => [session.id, session]));
    const nextActiveSessions = { ...remoteActiveSessions, ...localActiveSessions };
    const nextRecords = calculatePersonalRecords(recordResult.data ?? []);
    setRoutines(nextRoutines);
    setSessions(nextSessions);
    setWeekSessions(nextWeekSessions);
    setActiveSessions(nextActiveSessions);
    setRecords(nextRecords);
    await Promise.all([
      hasPendingChanges ? Promise.resolve() : setCached(cacheKeys.routines(user.id), remoteRoutines),
      setCached(sessionCacheKey, nextSessions),
      setCached(weekSessionCacheKey, nextWeekSessions),
      setCached(`personal-records:${user.id}`, nextRecords),
      ...draftsThisWeek.map((draft) => cacheSessionSummary(user.id, sessionSummary(draft)))
    ]);
  };

  useEffect(() => { void load(); }, [user, selectedDate]);

  const startRoutine = async (routine: Routine) => {
    if (!user || !profile) return;
    if (weekSessions.some((session) => session.routine_id === routine.id && session.finished_at)) return;

    const existingDraft = chooseBestDraft(readPermanentDrafts().filter((draft) => draft.routine_id === routine.id && draft.session_date === selectedDate));
    const existingSummary = sessions
      .filter((session) => session.routine_id === routine.id && session.session_date === selectedDate && !session.finished_at)
      .sort((a, b) => String(a.started_at ?? '').localeCompare(String(b.started_at ?? '')))[0];
    const existingSession = existingDraft ?? existingSummary;
    if (existingSession?.id) {
      navigate(`/sesion/${existingSession.id}`);
      return;
    }

    setStarting(routine.id);
    setError('');
    const sessionId = crypto.randomUUID();
    const sessionDate = selectedDate;
    const startedAt = new Date().toISOString();
    const workoutExercises = routine.routine_exercises.map((item) => ({
      id: crypto.randomUUID(), session_id: sessionId, planned_routine_exercise_id: item.id,
      exercise_id: item.exercise.id, position: item.position, exercise: item.exercise,
      planned: { target_sets: item.target_sets, rep_min: item.rep_min, rep_max: item.rep_max, rir_target: item.rir_target },
      workout_sets: Array.from({ length: item.target_sets }, (_, index) => ({ id: crypto.randomUUID(), set_number: index + 1, weight_kg: null, reps: null, rir: null, completed: false }))
    }));
    const localSession = { id: sessionId, user_id: user.id, routine_id: routine.id, session_date: sessionDate, started_at: startedAt, finished_at: null, notes: null, routine: { name: routine.name }, workout_exercises: workoutExercises };
    const summary = sessionSummary(localSession);
    try {
      localStorage.setItem(`modo-brigido-session-draft:${sessionId}`, JSON.stringify({ updatedAt: Date.now(), session: localSession }));
    } catch {
      // IndexedDB y la cola de sincronización siguen siendo copias de respaldo.
    }
    const nextDateSessions = [summary, ...sessions.filter((session) => session.id !== sessionId)];
    const nextWeekSessions = [summary, ...weekSessions.filter((session) => session.id !== sessionId)];
    await Promise.all([
      setCached(cacheKeys.workoutSession(sessionId), localSession),
      cacheSessionSummary(user.id, summary),
      persistSelectedDateSessions(nextDateSessions),
      persistWeekSessions(nextWeekSessions)
    ]);
    setActiveSessions((current) => ({ ...current, [sessionId]: localSession }));
    await queueMutation({ operation: 'upsert', table: 'workout_sessions', dedupeKey: `session:${sessionId}`, payload: { id: sessionId, user_id: user.id, routine_id: routine.id, session_date: sessionDate, started_at: startedAt, finished_at: null, notes: null } });
    await queueMutation({ operation: 'upsert', table: 'workout_exercises', dedupeKey: `session-exercises:${sessionId}`, payload: workoutExercises.map((item) => ({ id: item.id, session_id: sessionId, planned_routine_exercise_id: item.planned_routine_exercise_id, exercise_id: item.exercise_id, position: item.position })) });
    await queueMutation({ operation: 'upsert', table: 'workout_sets', dedupeKey: `session-sets:${sessionId}`, payload: workoutExercises.flatMap((exercise) => exercise.workout_sets.map((set) => ({ ...set, workout_exercise_id: exercise.id }))) });
    if (navigator.onLine) await syncPendingMutations();
    setStarting(null);
    navigate(`/sesion/${sessionId}`);
  };

  const unmarkRoutine = async (session: any) => {
    if (!user || !session?.id) return;
    setUpdatingSession(session.id);
    const nextDateSessions = sessions.map((item) => item.id === session.id ? { ...item, finished_at: null } : item);
    const nextWeekSessions = weekSessions.map((item) => item.id === session.id ? { ...item, finished_at: null } : item);
    await Promise.all([
      persistSelectedDateSessions(nextDateSessions),
      persistWeekSessions(nextWeekSessions),
      cacheSessionSummary(user.id, { ...session, finished_at: null })
    ]);
    await saveMutation({ operation: 'update', table: 'workout_sessions', payload: { finished_at: null, updated_at: new Date().toISOString() }, match: { id: session.id }, dedupeKey: `unfinish-session:${session.id}` });
    setUpdatingSession(null);
  };

  if (loading) return <div className="page-loading">Cargando tus rutinas…</div>;

  return <div className="page-grid">
    <section className="page-heading simple">
      <div>
        <p className="eyebrow">{isToday ? 'ENTRENAMIENTO DE HOY' : 'ASIGNANDO ENTRENAMIENTO ATRASADO'}</p>
        <h1>{prettyDate(selectedDate)}</h1>
        <p className="muted">Tu programa tiene {routines.length} día{routines.length === 1 ? '' : 's'}. La rutina que inicies quedará registrada en esta fecha.</p>
      </div>
      <div className="button-row">
        {!isToday && <button className="secondary-button" onClick={resetToToday}><CalendarDays size={17} /> Volver a hoy</button>}
        <button className="secondary-button" onClick={load}><RefreshCw size={17} /> Actualizar</button>
        <Link className="primary-button" to="/rutinas"><Pencil size={17} /> Editar programa</Link>
      </div>
    </section>

    {!isToday && <div className="selected-date-banner"><CalendarDays size={18} /><div><strong>Fecha histórica activa</strong><span>Seguirá seleccionada en toda la app hasta que presiones “Volver a hoy”.</span></div></div>}
    {!navigator.onLine && <div className="alert success"><CloudOff size={16} /> Modo offline: los cambios se sincronizarán al volver internet.</div>}
    {error && <div className="alert error">{error}</div>}

    <section className="routine-grid">{routines.map((routine, index) => {
      const routineSessions = sessions.filter((session) => session.routine_id === routine.id);
      const activeCandidates = routineSessions.filter((session) => !session.finished_at).sort((a, b) => {
        const scoreDifference = workoutProgressScore(activeSessions[b.id]) - workoutProgressScore(activeSessions[a.id]);
        if (scoreDifference !== 0) return scoreDifference;
        return String(a.started_at ?? '').localeCompare(String(b.started_at ?? ''));
      });
      const finishedCandidate = routineSessions.find((session) => session.finished_at);
      const assignedSession = finishedCandidate ?? activeCandidates[0];
      const completedThisWeek = weekSessions.find((session) => session.routine_id === routine.id && session.finished_at);
      const isFinished = Boolean(assignedSession?.finished_at);
      const isInProgress = Boolean(assignedSession && !assignedSession.finished_at);
      const lockedByAnotherDay = Boolean(completedThisWeek && completedThisWeek.id !== assignedSession?.id);
      const isWeeklyLocked = isFinished || lockedByAnotherDay;
      const cardClassName = isWeeklyLocked ? 'routine-card weekly-locked' : 'routine-card';
      const activeSession = assignedSession ? activeSessions[assignedSession.id] : null;
      const displayedExercises = isInProgress && activeSession?.workout_exercises?.length
        ? [...activeSession.workout_exercises].sort((a: any, b: any) => a.position - b.position).map((item: any) => ({
          id: item.planned_routine_exercise_id ?? item.id,
          target_sets: item.planned?.target_sets ?? item.workout_sets?.length ?? 2,
          rep_min: item.planned?.rep_min ?? 8,
          rep_max: item.planned?.rep_max ?? 12,
          rir_target: item.planned?.rir_target ?? 3,
          exercise: Array.isArray(item.exercise) ? item.exercise[0] : item.exercise
        }))
        : routine.routine_exercises;
      return <article className={cardClassName} key={routine.id}>
        <div className="routine-card-top"><div className="metric-icon"><Dumbbell /></div><div><span>Día {index + 1}</span><h2>{routine.name}</h2></div>{isFinished ? <span className="status-chip green"><CheckCircle2 size={14} /> Hecha</span> : lockedByAnotherDay ? <span className="status-chip weekly-lock"><LockKeyhole size={14} /> Hecha esta semana</span> : isInProgress ? <span className="status-chip orange">En curso</span> : <span className="status-chip">Disponible</span>}</div>
        <ol>{displayedExercises.map((item: any) => <li key={item.id}><span>{item.exercise?.name ?? 'Ejercicio'}</span><small>{item.target_sets} × {item.rep_min}–{item.rep_max} · RIR {item.rir_target}</small></li>)}</ol>
        {!displayedExercises.length && <div className="alert error">Agrega al menos un ejercicio desde “Editar programa”.</div>}
        {assignedSession ? <p className="last-session"><CalendarDays size={15} /> Asignada a: {completedWorkoutDate(assignedSession.session_date)}</p> : completedThisWeek ? <p className="last-session"><LockKeyhole size={15} /> Completada esta semana: {completedWorkoutDate(completedThisWeek.session_date)}</p> : null}
        <div className="routine-action-row">
          <button className="primary-button" onClick={() => isInProgress ? navigate(`/sesion/${assignedSession.id}`) : startRoutine(routine)} disabled={starting === routine.id || !displayedExercises.length || isWeeklyLocked}><Play size={17} /> {starting === routine.id ? 'Preparando…' : isInProgress ? 'Continuar rutina' : isFinished ? 'Rutina completada' : lockedByAnotherDay ? 'Hecha esta semana' : 'Iniciar rutina'} <ChevronRight size={17} /></button>
          {isFinished && <button className="secondary-button routine-unmark" onClick={() => unmarkRoutine(assignedSession)} disabled={updatingSession === assignedSession.id}><RotateCcw size={16} /> {updatingSession === assignedSession.id ? 'Desmarcando…' : 'Desmarcar rutina'}</button>}
        </div>
      </article>;
    })}</section>

    <section className="panel records-panel"><div className="section-title"><div><p className="eyebrow">PR · PERSONAL RECORDS</p><h2>Récords personales</h2></div><Trophy /></div><p className="muted small">Se generan con tus series completadas y comparan el 1RM estimado por Epley.</p>
      {!records.length ? <div className="editor-empty"><Trophy /><span>Completa series con kilos y repeticiones para generar PR.</span></div> : <div className="records-grid">{records.slice(0, 12).map((record) => <article className="record-card" key={record.exerciseId}><div><span>{record.exerciseName}</span><strong>{record.weightKg} kg × {record.reps}</strong></div><div><small>1RM estimado</small><strong>{record.estimatedOneRepMax.toFixed(1)} kg</strong><em>{record.date}</em></div></article>)}</div>}
    </section>
  </div>;
}
