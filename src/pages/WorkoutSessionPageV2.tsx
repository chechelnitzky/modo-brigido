import { ArrowLeft, BellRing, Check, CheckCircle2, CloudOff, Dumbbell, Pause, Play, RefreshCw, RotateCcw, Save, Search, TimerReset } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ExerciseCreator } from '../components/ExerciseCreator';
import { Modal } from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { useOfflineStatus } from '../hooks/useOfflineStatus';
import { cacheKeys, cacheSessionSummary, getCached, queueMutation, saveMutation, setCached, syncPendingMutations, updateCachedRoutineExercise } from '../lib/offline';
import { getSupabase } from '../lib/supabase';
import {
  getTimerNotificationPermission,
  prepareTimerAlerts,
  requestTimerNotificationPermission,
  triggerTimerFinishedAlert,
  type TimerNotificationPermission
} from '../lib/timerAlerts';
import type { Exercise } from '../types';

const REST_SECONDS = 120;
type TimerState = { remaining: number; endAt: number | null; running: boolean; finished: boolean };
type LastExerciseWeights = Record<string, number>;
type StoredSessionDraft = { updatedAt: number; session: any };

function formatTimer(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`;
}

function singleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function normalizeSessionData(data: any) {
  return {
    ...data,
    routine: singleRelation(data?.routine),
    workout_exercises: [...(data?.workout_exercises ?? [])]
      .sort((a: any, b: any) => a.position - b.position)
      .map((item: any) => ({
        ...item,
        exercise: singleRelation(item.exercise),
        planned: singleRelation(item.planned),
        workout_sets: [...(item.workout_sets ?? [])].sort((a: any, b: any) => a.set_number - b.set_number)
      }))
  };
}

function mergeSessionData(remote: any, cached: any) {
  const r = remote ? normalizeSessionData(remote) : null;
  const c = cached ? normalizeSessionData(cached) : null;
  if (!r) return c;
  if (!c) return r;
  if (!r.workout_exercises.length && c.workout_exercises.length) return c;

  const cachedById = new Map(c.workout_exercises.map((item: any) => [item.id, item]));
  const merged = r.workout_exercises.map((remoteExercise: any) => {
    const cachedExercise: any = cachedById.get(remoteExercise.id);
    if (!cachedExercise) return remoteExercise;

    const remoteSets = remoteExercise.workout_sets ?? [];
    const cachedSets = cachedExercise.workout_sets ?? [];
    const cachedSetsById = new Map(cachedSets.map((set: any) => [set.id, set]));
    const mergedSets = remoteSets.map((remoteSet: any) => {
      const cachedSet = cachedSetsById.get(remoteSet.id) as any;
      return cachedSet ? { ...remoteSet, ...cachedSet } : remoteSet;
    });
    for (const cachedSet of cachedSets) {
      if (!mergedSets.some((item: any) => item.id === cachedSet.id)) mergedSets.push(cachedSet);
    }

    return {
      ...remoteExercise,
      ...cachedExercise,
      exercise: cachedExercise.exercise ?? remoteExercise.exercise,
      planned: cachedExercise.planned ?? remoteExercise.planned,
      workout_sets: mergedSets
    };
  });
  for (const cachedExercise of c.workout_exercises) {
    if (!merged.some((item: any) => item.id === cachedExercise.id)) merged.push(cachedExercise);
  }

  return normalizeSessionData({ ...r, ...c, workout_exercises: merged });
}

function sessionExerciseIds(nextSession: any): number[] {
  const exerciseIds = (nextSession?.workout_exercises ?? [])
    .map((exercise: any) => Number(exercise.exercise_id))
    .filter((exerciseId: number) => Number.isFinite(exerciseId)) as number[];
  return [...new Set<number>(exerciseIds)];
}

function weightsForSession(nextSession: any, source: LastExerciseWeights): LastExerciseWeights {
  return Object.fromEntries(sessionExerciseIds(nextSession).map((exerciseId) => [String(exerciseId), source[String(exerciseId)] ?? 0]));
}

function lastCompletedWeight(workoutSets: any[]): number {
  const completedSets = [...(workoutSets ?? [])]
    .filter((set: any) => set.completed)
    .sort((a: any, b: any) => Number(a.set_number) - Number(b.set_number));

  for (let index = completedSets.length - 1; index >= 0; index -= 1) {
    const rawWeight = completedSets[index].weight_kg;
    if (rawWeight === null || rawWeight === '') continue;
    const weight = Number(rawWeight);
    if (Number.isFinite(weight) && weight >= 0) return weight;
  }
  return 0;
}

function calculateLastExerciseWeights(rows: any[], exerciseIds: number[]): LastExerciseWeights {
  const result: LastExerciseWeights = Object.fromEntries(exerciseIds.map((exerciseId) => [String(exerciseId), 0]));
  const unresolved = new Set(exerciseIds.map(String));

  for (const workoutSession of rows) {
    for (const workoutExercise of workoutSession.workout_exercises ?? []) {
      const key = String(workoutExercise.exercise_id);
      if (!unresolved.has(key)) continue;
      result[key] = lastCompletedWeight(workoutExercise.workout_sets ?? []);
      unresolved.delete(key);
    }
    if (!unresolved.size) break;
  }

  return result;
}

function formatWeightKg(weight: number): string {
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(Number.isFinite(weight) ? weight : 0);
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function WorkoutSessionPageV2() {
  const { id } = useParams();
  const navigate = useNavigate();
  const supabase = getSupabase();
  const { user } = useAuth();
  const sync = useOfflineStatus();
  const [session, setSession] = useState<any>(null);
  const [library, setLibrary] = useState<Exercise[]>([]);
  const [replaceTarget, setReplaceTarget] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lastExerciseWeights, setLastExerciseWeights] = useState<LastExerciseWeights>({});
  const [lastWeightsLoading, setLastWeightsLoading] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState<TimerNotificationPermission>(getTimerNotificationPermission());
  const [timer, setTimer] = useState<TimerState>({ remaining: REST_SECONDS, endAt: null, running: false, finished: false });
  const timerStorageKey = `modo-brigido-rest-timer:${id ?? 'unknown'}`;
  const sessionDraftKey = `modo-brigido-session-draft:${id ?? 'unknown'}`;
  const alertedEndAtRef = useRef<number | null>(null);
  const sessionRef = useRef<any>(null);
  const snapshotTimerRef = useRef<number | null>(null);

  const cacheCurrentSession = async (next: any) => {
    if (id) await setCached(cacheKeys.workoutSession(id), next);
  };

  const queueSessionSnapshot = async (nextSession: any) => {
    if (!id || !nextSession) return;

    const workoutExercises = (nextSession.workout_exercises ?? []).map((exercise: any) => ({
      id: exercise.id,
      session_id: id,
      planned_routine_exercise_id: exercise.planned_routine_exercise_id ?? null,
      exercise_id: Number(exercise.exercise_id),
      position: Number(exercise.position)
    }));
    const workoutSets = (nextSession.workout_exercises ?? []).flatMap((exercise: any) =>
      (exercise.workout_sets ?? []).map((set: any) => ({
        id: set.id,
        workout_exercise_id: exercise.id,
        set_number: Number(set.set_number),
        weight_kg: numberOrNull(set.weight_kg),
        reps: numberOrNull(set.reps),
        rir: numberOrNull(set.rir),
        completed: Boolean(set.completed)
      }))
    );

    if (workoutExercises.length) {
      await queueMutation({
        operation: 'upsert',
        table: 'workout_exercises',
        payload: workoutExercises,
        dedupeKey: `session-exercises:${id}`
      });
    }
    if (workoutSets.length) {
      await queueMutation({
        operation: 'upsert',
        table: 'workout_sets',
        payload: workoutSets,
        dedupeKey: `session-sets:${id}`
      });
    }
    if (navigator.onLine) await syncPendingMutations();
  };

  const scheduleSessionSnapshot = (nextSession: any) => {
    if (snapshotTimerRef.current !== null) window.clearTimeout(snapshotTimerRef.current);
    snapshotTimerRef.current = window.setTimeout(() => {
      snapshotTimerRef.current = null;
      void queueSessionSnapshot(nextSession);
    }, 650);
  };

  const persistCurrentSession = (nextSession: any, scheduleSync = true) => {
    sessionRef.current = nextSession;
    try {
      const draft: StoredSessionDraft = { updatedAt: Date.now(), session: nextSession };
      localStorage.setItem(sessionDraftKey, JSON.stringify(draft));
    } catch {
      // IndexedDB remains as the secondary local copy if localStorage is unavailable.
    }
    void cacheCurrentSession(nextSession);
    if (scheduleSync && !nextSession.finished_at) scheduleSessionSnapshot(nextSession);
  };

  const readSessionDraft = () => {
    try {
      const saved = localStorage.getItem(sessionDraftKey);
      if (!saved) return null;
      const parsed = JSON.parse(saved) as StoredSessionDraft;
      return parsed?.session ? normalizeSessionData(parsed.session) : null;
    } catch {
      localStorage.removeItem(sessionDraftKey);
      return null;
    }
  };

  const repairMissingSets = async (nextSession: any) => {
    const inserts: any[] = [];
    const repaired = {
      ...nextSession,
      workout_exercises: nextSession.workout_exercises.map((exercise: any) => {
        if (exercise.workout_sets?.length) return exercise;
        const targetSets = Number(exercise.planned?.target_sets ?? 2);
        const workoutSets = Array.from({ length: Math.max(1, targetSets) }, (_, index) => ({
          id: crypto.randomUUID(),
          set_number: index + 1,
          weight_kg: null,
          reps: null,
          rir: null,
          completed: false
        }));
        inserts.push(...workoutSets.map((set) => ({ ...set, workout_exercise_id: exercise.id })));
        return { ...exercise, workout_sets: workoutSets };
      })
    };
    if (inserts.length) {
      await queueMutation({ operation: 'upsert', table: 'workout_sets', payload: inserts, dedupeKey: `repair-session-sets:${id}` });
      if (navigator.onLine) void syncPendingMutations();
    }
    return repaired;
  };

  const loadLastExerciseWeights = async (nextSession: any, cachedWeights: LastExerciseWeights = {}) => {
    const exerciseIds = sessionExerciseIds(nextSession);
    setLastExerciseWeights(weightsForSession(nextSession, cachedWeights));
    if (!user || !id || !exerciseIds.length || !navigator.onLine) {
      setLastWeightsLoading(false);
      return;
    }

    setLastWeightsLoading(true);
    const { data, error: historyError } = await supabase
      .from('workout_sessions')
      .select(`id,finished_at,workout_exercises(exercise_id,workout_sets(set_number,weight_kg,completed))`)
      .eq('user_id', user.id)
      .not('finished_at', 'is', null)
      .neq('id', id)
      .order('finished_at', { ascending: false });

    if (historyError) {
      setLastWeightsLoading(false);
      return;
    }

    const nextWeights = calculateLastExerciseWeights(data ?? [], exerciseIds);
    const mergedWeights = { ...cachedWeights, ...nextWeights };
    setLastExerciseWeights(nextWeights);
    await setCached(`last-exercise-weights:${user.id}`, mergedWeights);
    setLastWeightsLoading(false);
  };

  const load = async () => {
    if (!id) return;
    setError('');
    setLastWeightsLoading(true);
    const [indexedSession, cachedWeights] = await Promise.all([
      getCached<any>(cacheKeys.workoutSession(id)),
      user ? getCached<LastExerciseWeights>(`last-exercise-weights:${user.id}`) : Promise.resolve(null)
    ]);
    const draftSession = readSessionDraft();
    let nextSession = mergeSessionData(indexedSession, draftSession);
    if (nextSession) {
      sessionRef.current = nextSession;
      setSession(nextSession);
      setLastExerciseWeights(weightsForSession(nextSession, cachedWeights ?? {}));
    }
    if (!navigator.onLine) {
      setLastWeightsLoading(false);
      if (!nextSession) setError('Esta sesión no está guardada en este dispositivo.');
      return;
    }

    await syncPendingMutations();
    const { data, error: loadError } = await supabase
      .from('workout_sessions')
      .select(`id,user_id,routine_id,session_date,started_at,finished_at,notes,routine:routine_templates(name),workout_exercises(id,position,exercise_id,planned_routine_exercise_id,exercise:exercise_library(id,slug,name,category,primary_muscle,pattern,equipment,user_id),planned:routine_exercises(target_sets,rep_min,rep_max,rir_target),workout_sets(id,set_number,weight_kg,reps,rir,completed))`)
      .eq('id', id)
      .single();
    if (loadError) {
      if (!nextSession) setError(loadError.message);
      if (nextSession) await loadLastExerciseWeights(nextSession, cachedWeights ?? {});
      else setLastWeightsLoading(false);
      return;
    }
    if (data) {
      nextSession = await repairMissingSets(mergeSessionData(data, nextSession));
      setSession(nextSession);
      persistCurrentSession(nextSession, false);
      if (!nextSession.finished_at) await queueSessionSnapshot(nextSession);
      await loadLastExerciseWeights(nextSession, cachedWeights ?? {});
    } else {
      setLastWeightsLoading(false);
    }
  };

  useEffect(() => { void load(); }, [id, user?.id]);

  useEffect(() => {
    const flushDraft = () => {
      const current = sessionRef.current;
      if (!current || current.finished_at) return;
      if (snapshotTimerRef.current !== null) {
        window.clearTimeout(snapshotTimerRef.current);
        snapshotTimerRef.current = null;
      }
      persistCurrentSession(current, false);
      void queueSessionSnapshot(current);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushDraft();
    };

    window.addEventListener('pagehide', flushDraft);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flushDraft);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushDraft();
    };
  }, [id, user?.id]);

  useEffect(() => {
    const saved = localStorage.getItem(timerStorageKey);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as TimerState;
      if (parsed.running && parsed.endAt) {
        const remaining = Math.max(0, Math.ceil((parsed.endAt - Date.now()) / 1000));
        setTimer({ ...parsed, remaining, running: remaining > 0, finished: remaining === 0 });
        if (remaining === 0 && alertedEndAtRef.current !== parsed.endAt) {
          alertedEndAtRef.current = parsed.endAt;
          void triggerTimerFinishedAlert(session?.routine?.name);
        }
      } else {
        setTimer(parsed);
      }
    } catch {
      localStorage.removeItem(timerStorageKey);
    }
  }, [timerStorageKey, session?.routine?.name]);

  useEffect(() => {
    localStorage.setItem(timerStorageKey, JSON.stringify(timer));
  }, [timer, timerStorageKey]);

  useEffect(() => {
    if (!timer.running || !timer.endAt) return;
    const endAt = timer.endAt;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      if (remaining > 0) {
        setTimer((current) => ({ ...current, remaining }));
        return;
      }
      setTimer({ remaining: 0, endAt: null, running: false, finished: true });
      if (alertedEndAtRef.current !== endAt) {
        alertedEndAtRef.current = endAt;
        void triggerTimerFinishedAlert(session?.routine?.name);
      }
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [timer.running, timer.endAt, session?.routine?.name]);

  const startTimer = (seconds = REST_SECONDS) => {
    void prepareTimerAlerts();
    alertedEndAtRef.current = null;
    setTimer({ remaining: seconds, endAt: Date.now() + seconds * 1000, running: true, finished: false });
  };

  const toggleTimer = () => {
    if (timer.running) {
      const remaining = timer.endAt ? Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000)) : timer.remaining;
      setTimer({ remaining, endAt: null, running: false, finished: false });
    } else {
      startTimer(timer.remaining > 0 ? timer.remaining : REST_SECONDS);
    }
  };

  const resetTimer = () => {
    alertedEndAtRef.current = null;
    setTimer({ remaining: REST_SECONDS, endAt: null, running: false, finished: false });
  };

  const enableNotifications = async () => {
    const permission = await requestTimerNotificationPermission();
    setNotificationPermission(permission);
  };

  const loadLibrary = async (target: any) => {
    setReplaceTarget(target);
    if (library.length) return;
    const cached = await getCached<Exercise[]>(cacheKeys.exerciseLibrary);
    if (cached) setLibrary(cached);
    if (!navigator.onLine) return;
    const { data } = await supabase
      .from('exercise_library')
      .select('id,slug,name,category,primary_muscle,pattern,equipment,user_id')
      .order('name');
    const next = (data ?? []) as Exercise[];
    setLibrary(next);
    await setCached(cacheKeys.exerciseLibrary, next);
  };

  const filteredLibrary = useMemo(() => {
    const query = search.trim().toLowerCase();
    return library.filter((exercise) => !query || `${exercise.name} ${exercise.primary_muscle} ${exercise.equipment} ${exercise.pattern} ${exercise.category}`.toLowerCase().includes(query));
  }, [library, search]);

  const handleReplacementExerciseCreated = (exercise: Exercise) => {
    setLibrary((current) => [...current.filter((item) => item.id !== exercise.id), exercise].sort((a, b) => a.name.localeCompare(b.name, 'es')));
    setSearch(exercise.name);
  };

  const editSetLocal = (exerciseId: string, setId: string, field: string, value: string | boolean) => {
    setSession((current: any) => {
      const next = {
        ...current,
        workout_exercises: current.workout_exercises.map((exercise: any) => exercise.id === exerciseId
          ? { ...exercise, workout_sets: exercise.workout_sets.map((set: any) => set.id === setId ? { ...set, [field]: value === '' ? null : value } : set) }
          : exercise)
      };
      persistCurrentSession(next);
      return next;
    });
  };

  const saveSet = async (set: any) => {
    if (!set) return;
    setSaving(true);
    await saveMutation({
      operation: 'update',
      table: 'workout_sets',
      payload: {
        weight_kg: numberOrNull(set.weight_kg),
        reps: numberOrNull(set.reps),
        rir: numberOrNull(set.rir),
        completed: Boolean(set.completed),
        updated_at: new Date().toISOString()
      },
      match: { id: set.id },
      dedupeKey: `set:${set.id}`
    });
    setSaving(false);
  };

  const toggleComplete = async (exerciseId: string, set: any) => {
    const completed = !set.completed;
    editSetLocal(exerciseId, set.id, 'completed', completed);
    await saveMutation({
      operation: 'update',
      table: 'workout_sets',
      payload: { completed, updated_at: new Date().toISOString() },
      match: { id: set.id },
      dedupeKey: `set-complete:${set.id}`
    });
    if (completed) startTimer();
  };

  const toggleExerciseComplete = async (exercise: any) => {
    const markCompleted = !(exercise.workout_sets.length > 0 && exercise.workout_sets.every((set: any) => set.completed));
    const updatedAt = new Date().toISOString();
    setSession((current: any) => {
      const next = {
        ...current,
        workout_exercises: current.workout_exercises.map((item: any) => item.id === exercise.id
          ? { ...item, workout_sets: item.workout_sets.map((set: any) => ({ ...set, completed: markCompleted })) }
          : item)
      };
      persistCurrentSession(next);
      return next;
    });
    for (const set of exercise.workout_sets) {
      await queueMutation({
        operation: 'update',
        table: 'workout_sets',
        payload: { completed: markCompleted, updated_at: updatedAt },
        match: { id: set.id },
        dedupeKey: `set-complete:${set.id}`
      });
    }
    if (navigator.onLine) await syncPendingMutations();
    if (markCompleted) startTimer();
  };

  const addSet = async (exercise: any) => {
    const nextNumber = (exercise.workout_sets.at(-1)?.set_number ?? 0) + 1;
    const nextSet = { id: crypto.randomUUID(), set_number: nextNumber, weight_kg: null, reps: null, rir: null, completed: false };
    setSession((current: any) => {
      const next = {
        ...current,
        workout_exercises: current.workout_exercises.map((item: any) => item.id === exercise.id
          ? { ...item, workout_sets: [...item.workout_sets, nextSet] }
          : item)
      };
      persistCurrentSession(next);
      return next;
    });
    await saveMutation({ operation: 'upsert', table: 'workout_sets', payload: { ...nextSet, workout_exercise_id: exercise.id }, dedupeKey: `new-set:${nextSet.id}` });
  };

  const replaceExercise = async (exercise: Exercise, permanent: boolean) => {
    if (!replaceTarget || !user || !session) return;
    setSaving(true);
    const plannedId = replaceTarget.planned_routine_exercise_id;
    const nextSession = {
      ...session,
      workout_exercises: session.workout_exercises.map((item: any) => item.id === replaceTarget.id
        ? { ...item, exercise_id: exercise.id, exercise }
        : item)
    };
    setSession(nextSession);
    persistCurrentSession(nextSession);
    await saveMutation({ operation: 'update', table: 'workout_exercises', payload: { exercise_id: exercise.id }, match: { id: replaceTarget.id }, dedupeKey: `replace-session:${replaceTarget.id}` });
    if (permanent && plannedId) {
      await updateCachedRoutineExercise(user.id, plannedId, exercise);
      await saveMutation({ operation: 'update', table: 'routine_exercises', payload: { exercise_id: exercise.id, updated_at: new Date().toISOString() }, match: { id: plannedId }, dedupeKey: `replace-routine:${plannedId}` });
    }
    const cachedWeights = await getCached<LastExerciseWeights>(`last-exercise-weights:${user.id}`);
    await loadLastExerciseWeights(nextSession, cachedWeights ?? {});
    setReplaceTarget(null);
    setSearch('');
    setSaving(false);
  };

  const cacheFinishedExerciseWeights = async (nextSession: any) => {
    if (!user) return;
    const cacheKey = `last-exercise-weights:${user.id}`;
    const cachedWeights = await getCached<LastExerciseWeights>(cacheKey) ?? {};
    const updates: LastExerciseWeights = {};
    for (const exercise of nextSession.workout_exercises ?? []) {
      updates[String(exercise.exercise_id)] = lastCompletedWeight(exercise.workout_sets ?? []);
    }
    await setCached(cacheKey, { ...cachedWeights, ...updates });
  };

  const finish = async () => {
    if (!id || !user || !session) return;
    if (snapshotTimerRef.current !== null) {
      window.clearTimeout(snapshotTimerRef.current);
      snapshotTimerRef.current = null;
    }
    const finishedAt = new Date().toISOString();
    const next = { ...session, finished_at: finishedAt };
    setSession(next);
    persistCurrentSession(next, false);
    await Promise.all([
      cacheSessionSummary(user.id, { id, routine_id: session.routine_id, session_date: session.session_date, started_at: session.started_at, finished_at: finishedAt }),
      cacheFinishedExerciseWeights(next),
      queueSessionSnapshot(next)
    ]);
    await saveMutation({ operation: 'update', table: 'workout_sessions', payload: { finished_at: finishedAt, updated_at: finishedAt }, match: { id }, dedupeKey: `finish-session:${id}` });
    localStorage.removeItem(timerStorageKey);
    localStorage.removeItem(sessionDraftKey);
    navigate('/entreno');
  };

  if (!session) return <div className="page-loading">Preparando entrenamiento…</div>;

  const searchedName = search.trim();
  const noSearchResults = Boolean(searchedName) && filteredLibrary.length === 0;

  return (
    <div className="page-grid workout-session-page">
      <section className="session-header">
        <button className="icon-button" onClick={() => navigate('/entreno')}><ArrowLeft /></button>
        <div><p className="eyebrow">SESIÓN ACTIVA</p><h1>{session.routine?.name || 'Entrenamiento'}</h1><p className="muted">{session.session_date} · Los cambios pueden ser solo hoy o permanentes.</p></div>
        <span className={!sync.online ? 'status-chip orange' : 'status-chip'}>{saving ? 'Guardando…' : !sync.online ? <><CloudOff size={14} /> Offline</> : sync.pending ? `${sync.pending} pendiente${sync.pending === 1 ? '' : 's'}` : 'En línea'}</span>
      </section>

      {error && <div className="alert error">{error}</div>}
      {!session.workout_exercises.length && <div className="alert error">Esta sesión llegó sin ejercicios. Presiona recargar.<button className="secondary-button compact inline-reload" onClick={load}><RefreshCw size={15} /> Recargar</button></div>}

      <section className={timer.finished ? 'panel rest-timer finished' : timer.running ? 'panel rest-timer running' : 'panel rest-timer'}>
        <div className="rest-timer-copy">
          <div className="metric-icon"><TimerReset /></div>
          <div><p className="eyebrow">DESCANSO ENTRE SERIES</p><h2>{timer.finished ? '¡Listo, siguiente serie!' : 'Timer de 2 minutos'}</h2><p className="muted">Ding y vibración al terminar. Activa avisos para recibir una notificación en segundo plano.</p></div>
        </div>
        <div className="rest-timer-clock"><strong>{formatTimer(timer.remaining)}</strong><span>{timer.running ? 'corriendo' : timer.finished ? 'terminado' : 'preparado'}</span></div>
        <div className="rest-timer-actions">
          <button className="primary-button compact" onClick={toggleTimer}>{timer.running ? <Pause size={16} /> : <Play size={16} />} {timer.running ? 'Pausar' : timer.remaining < REST_SECONDS && timer.remaining > 0 ? 'Continuar' : 'Iniciar'}</button>
          <button className="secondary-button compact" onClick={resetTimer}><RotateCcw size={16} /> Reiniciar</button>
          {notificationPermission === 'default' && <button className="secondary-button compact notification-permission-button" onClick={enableNotifications}><BellRing size={16} /> Activar avisos</button>}
          {notificationPermission === 'granted' && <span className="timer-notification-state enabled"><BellRing size={15} /> Avisos activos</span>}
          {notificationPermission === 'denied' && <span className="timer-notification-state blocked">Avisos bloqueados</span>}
          {timer.finished && <BellRing className="timer-bell" />}
        </div>
      </section>

      <section className="exercise-stack">
        {session.workout_exercises.map((exercise: any) => {
          const exerciseCompleted = exercise.workout_sets.length > 0 && exercise.workout_sets.every((set: any) => set.completed);
          const previousWeight = lastExerciseWeights[String(exercise.exercise_id)] ?? 0;
          return (
            <article className={exerciseCompleted ? 'panel exercise-panel exercise-completed' : 'panel exercise-panel'} key={exercise.id}>
              <div className="exercise-title">
                <div className="metric-icon"><Dumbbell /></div>
                <div><span>{exercise.exercise?.primary_muscle} · {exercise.exercise?.equipment}</span><h2>{exercise.exercise?.name || 'Ejercicio'}</h2><small>Objetivo: {exercise.planned?.target_sets ?? exercise.workout_sets.length} × {exercise.planned?.rep_min ?? 8}–{exercise.planned?.rep_max ?? 12} · RIR {exercise.planned?.rir_target ?? 2}</small><small style={{ display: 'block', marginTop: 4 }}>Última vez: {lastWeightsLoading ? '…' : `${formatWeightKg(previousWeight)} kg`}</small></div>
                <div className="exercise-actions">
                  <button className={exerciseCompleted ? 'secondary-button compact exercise-toggle active' : 'secondary-button compact exercise-toggle'} onClick={() => toggleExerciseComplete(exercise)}>{exerciseCompleted ? <RotateCcw size={15} /> : <CheckCircle2 size={15} />} {exerciseCompleted ? 'Desmarcar ejercicio' : 'Marcar ejercicio hecho'}</button>
                  <button className="secondary-button compact" onClick={() => loadLibrary(exercise)}><RefreshCw size={15} /> Cambiar</button>
                </div>
              </div>
              <div className="sets-table">
                <div className="sets-head"><span>Serie</span><span>Kg</span><span>Reps</span><span>RIR</span><span>OK</span></div>
                {exercise.workout_sets.map((set: any) => <div className={set.completed ? 'set-row completed' : 'set-row'} key={set.id}>
                  <strong>{set.set_number}</strong>
                  <input inputMode="decimal" type="number" step="0.5" value={set.weight_kg ?? ''} onChange={(e) => editSetLocal(exercise.id, set.id, 'weight_kg', e.target.value)} onBlur={() => saveSet(exercise.workout_sets.find((item: any) => item.id === set.id))} />
                  <input inputMode="numeric" type="number" value={set.reps ?? ''} onChange={(e) => editSetLocal(exercise.id, set.id, 'reps', e.target.value)} onBlur={() => saveSet(exercise.workout_sets.find((item: any) => item.id === set.id))} />
                  <input inputMode="numeric" type="number" min="0" max="10" value={set.rir ?? ''} onChange={(e) => editSetLocal(exercise.id, set.id, 'rir', e.target.value)} onBlur={() => saveSet(exercise.workout_sets.find((item: any) => item.id === set.id))} />
                  <button className={set.completed ? 'set-check active' : 'set-check'} onClick={() => toggleComplete(exercise.id, set)} aria-label={set.completed ? 'Desmarcar serie' : 'Marcar serie'}><Check size={17} /></button>
                </div>)}
              </div>
              <button className="link-button inline" onClick={() => addSet(exercise)}>+ Agregar serie</button>
            </article>
          );
        })}
      </section>

      <div className="sticky-finish"><div><TimerReset /><span>Todo queda guardado localmente aunque pierdas internet.</span></div><button className="primary-button" onClick={finish}><CheckCircle2 /> Finalizar entrenamiento</button></div>

      {replaceTarget && <Modal title={`Cambiar ${replaceTarget.exercise?.name ?? 'ejercicio'}`} onClose={() => { setReplaceTarget(null); setSearch(''); }}>
        <div className="search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar ejercicio, músculo o máquina" /></div>
        <p className="muted small">“Solo hoy” modifica esta sesión. “Permanente” cambia la rutina futura.</p>
        {!library.length && !navigator.onLine && <div className="alert error">La biblioteca todavía no está descargada. Ábrela una vez con internet.</div>}
        {noSearchResults && <div className="editor-empty"><Dumbbell /><span>No encontramos “{searchedName}”. Puedes crearlo ahora y después elegir si el cambio es solo por hoy o permanente.</span></div>}
        <ExerciseCreator
          initialName={searchedName}
          buttonLabel={noSearchResults ? `Agregar “${searchedName}” como ejercicio nuevo` : 'Crear ejercicio personalizado'}
          onCreated={handleReplacementExerciseCreated}
        />
        <div className="library-list">{filteredLibrary.map((exercise) => <div className="library-item" key={exercise.id}><div><strong>{exercise.name}</strong><span>{exercise.primary_muscle} · {exercise.equipment}{exercise.user_id ? ' · Personalizado' : ''}</span></div><div><button className="secondary-button compact" onClick={() => replaceExercise(exercise, false)}>Solo hoy</button><button className="primary-button compact" onClick={() => replaceExercise(exercise, true)}><Save size={14} /> Permanente</button></div></div>)}</div>
      </Modal>}
    </div>
  );
}
