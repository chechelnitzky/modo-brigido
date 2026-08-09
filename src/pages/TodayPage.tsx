import { Activity, CalendarDays, Check, ChevronRight, CloudOff, Dumbbell, Flame, Footprints, Moon, Ruler, Scale, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DecimalInput } from '../components/DecimalInput';
import { ProgressBar } from '../components/ProgressBar';
import { ScoreRing } from '../components/ScoreRing';
import { StepDistanceInput } from '../components/StepDistanceInput';
import { useAuth } from '../context/AuthContext';
import { useSelectedDate } from '../context/SelectedDateContext';
import { estimateBodyCompositionForLog } from '../lib/bodyFat';
import { prettyDate } from '../lib/date';
import { dailyScore, numberOrNull } from '../lib/helpers';
import { cacheDailyLog, cacheKeys, cacheProfile, getCached, saveMutation } from '../lib/offline';
import { PACER_SYNC_EVENT, type PacerActivity } from '../lib/pacer';
import { formatKm, stepsToKm } from '../lib/steps';
import { getSupabase } from '../lib/supabase';
import type { DailyLog } from '../types';

const AUTOSAVE_DELAY_MS = 450;
const CHECKIN_FIELDS: Array<keyof DailyLog> = [
  'weight_kg', 'waist_cm', 'neck_cm', 'hip_cm', 'sleep_score', 'energy_score', 'hunger_score',
  'cannabis', 'calories', 'protein_g', 'notes'
];
const BODY_COMPOSITION_FIELDS = new Set<keyof DailyLog>(['weight_kg', 'waist_cm', 'neck_cm', 'hip_cm']);

function emptyLog(userId: string, date: string): DailyLog {
  return {
    id: crypto.randomUUID(), user_id: userId, log_date: date, weight_kg: null, waist_cm: null,
    neck_cm: null, hip_cm: null, sleep_score: null, energy_score: null, hunger_score: null,
    cannabis: null, calories: null, protein_g: null, steps: null, notes: null
  };
}

function mergeServerWithLocal(server: DailyLog, local: DailyLog | null): DailyLog {
  if (!local) return server;
  const next: DailyLog = { ...server };
  for (const key of CHECKIN_FIELDS) {
    if ((server as any)[key] == null && (local as any)[key] != null) {
      (next as any)[key] = (local as any)[key];
    }
  }
  if ((server.steps ?? 0) === 0 && (local.steps ?? 0) > 0) next.steps = local.steps;
  return next;
}

function Rating({ value, onChange }: { value: number | null; onChange: (value: number) => void }) {
  return <div className="rating-row">{[1, 2, 3, 4, 5].map((item) => <button type="button" key={item} className={value === item ? 'rating active' : 'rating'} onClick={() => onChange(item)}>{item}</button>)}</div>;
}

export function TodayPage() {
  const supabase = getSupabase();
  const { user, profile, refreshProfile } = useAuth();
  const { selectedDate, today, isToday, setSelectedDate, resetToToday } = useSelectedDate();
  const [log, setLog] = useState<DailyLog | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedState, setSavedState] = useState<'none' | 'saving' | 'synced' | 'offline'>('none');
  const [error, setError] = useState('');
  const dateInputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<DailyLog | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const pendingPatchRef = useRef<Partial<DailyLog>>({});

  useEffect(() => { logRef.current = log; }, [log]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    pendingPatchRef.current = {};
    if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;

    void (async () => {
      setError('');
      setSavedState('none');
      const cached = await getCached<DailyLog>(cacheKeys.daily(user.id, selectedDate));
      if (!cancelled) {
        const first = cached ?? emptyLog(user.id, selectedDate);
        logRef.current = first;
        setLog(first);
      }
      if (!navigator.onLine) {
        if (!cancelled) setSavedState('offline');
        return;
      }
      const { data, error: loadError } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('log_date', selectedDate)
        .maybeSingle();
      if (cancelled) return;
      if (loadError) {
        if (!cached) setError(loadError.message);
        return;
      }
      const server = data as DailyLog | null;
      const next = server ? mergeServerWithLocal(server, cached) : cached ?? emptyLog(user.id, selectedDate);
      logRef.current = next;
      setLog(next);
      setSavedState('synced');
      await cacheDailyLog(next);
    })();
    return () => { cancelled = true; };
  }, [supabase, user, selectedDate]);

  const saveAutomaticTargets = async (nextLog: DailyLog): Promise<'synced' | 'queued'> => {
    if (!profile || !user || !isToday) return 'synced';
    const estimate = estimateBodyCompositionForLog(profile, nextLog);
    if (!estimate?.estimatedTargetWeightKg || !estimate.estimatedTargetWaistCm) return 'synced';

    const nextProfile = {
      ...profile,
      weight_target: estimate.estimatedTargetWeightKg,
      waist_target: estimate.estimatedTargetWaistCm
    };
    await cacheProfile(nextProfile);
    const result = await saveMutation({
      operation: 'update',
      table: 'profiles',
      payload: {
        weight_target: nextProfile.weight_target,
        waist_target: nextProfile.waist_target,
        updated_at: new Date().toISOString()
      },
      match: { id: user.id },
      dedupeKey: `automatic-targets:${user.id}`
    });
    await refreshProfile();
    return result;
  };

  const persistPatch = async (patch: Partial<DailyLog>, nextLog: DailyLog | null) => {
    if (!user || Object.keys(patch).length === 0) return;
    setSaving(true);
    setError('');
    try {
      const dailyResult = await saveMutation({
        operation: 'upsert',
        table: 'daily_logs',
        payload: {
          user_id: user.id,
          log_date: selectedDate,
          ...patch,
          updated_at: new Date().toISOString()
        },
        onConflict: 'user_id,log_date',
        dedupeKey: `daily-autosave:${user.id}:${selectedDate}`
      });
      const changedBodyComposition = Object.keys(patch).some((key) => BODY_COMPOSITION_FIELDS.has(key as keyof DailyLog));
      const targetResult = changedBodyComposition && nextLog ? await saveAutomaticTargets(nextLog) : 'synced';
      setSavedState(dailyResult === 'synced' && targetResult === 'synced' ? 'synced' : 'offline');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar automáticamente.');
      setSavedState(navigator.onLine ? 'none' : 'offline');
    } finally {
      setSaving(false);
    }
  };

  const flushAutosave = () => {
    if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;
    const patch = pendingPatchRef.current;
    pendingPatchRef.current = {};
    if (Object.keys(patch).length) void persistPatch(patch, logRef.current);
  };

  const scheduleAutosave = (patch: Partial<DailyLog>) => {
    pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
    setSavedState('saving');
    if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(flushAutosave, AUTOSAVE_DELAY_MS);
  };

  useEffect(() => () => {
    if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current);
    const patch = pendingPatchRef.current;
    pendingPatchRef.current = {};
    if (user && Object.keys(patch).length) {
      void saveMutation({
        operation: 'upsert',
        table: 'daily_logs',
        payload: { user_id: user.id, log_date: selectedDate, ...patch, updated_at: new Date().toISOString() },
        onConflict: 'user_id,log_date',
        dedupeKey: `daily-autosave:${user.id}:${selectedDate}`
      });
    }
  }, [user, selectedDate]);

  useEffect(() => {
    if (!user) return;
    const handlePacerSync = (event: Event) => {
      const activities = ((event as CustomEvent<{ activities?: PacerActivity[] }>).detail?.activities ?? []);
      const activity = activities.find((item) => item.activity_date === selectedDate);

      void (async () => {
        const { data } = await supabase
          .from('daily_logs')
          .select('*')
          .eq('user_id', user.id)
          .eq('log_date', selectedDate)
          .maybeSingle();
        const server = data as DailyLog | null;
        setLog((current) => {
          if (!current) return current;
          let next = server ? mergeServerWithLocal(server, current) : current;
          if (activity) {
            const incoming = Math.max(0, Math.round(Number(activity.steps) || 0));
            const nextSteps = incoming === 0 && (next.steps ?? 0) > 0 ? next.steps : incoming;
            next = { ...next, steps: nextSteps };
          }
          // A field the user is actively typing always wins over a simultaneous cloud refresh.
          next = { ...next, ...pendingPatchRef.current };
          logRef.current = next;
          void cacheDailyLog(next);
          return next;
        });
      })();
    };

    window.addEventListener(PACER_SYNC_EVENT, handlePacerSync);
    return () => window.removeEventListener(PACER_SYNC_EVENT, handlePacerSync);
  }, [supabase, user, selectedDate]);

  const score = useMemo(() => dailyScore(log, profile), [log, profile]);
  const bodyComposition = useMemo(
    () => profile && log ? estimateBodyCompositionForLog(profile, log) : null,
    [profile, log]
  );

  const update = <K extends keyof DailyLog>(key: K, value: DailyLog[K]) => {
    setLog((current) => {
      if (!current) return current;
      const next = { ...current, [key]: value };
      logRef.current = next;
      void cacheDailyLog(next);
      return next;
    });
    scheduleAutosave({ [key]: value } as Partial<DailyLog>);
  };

  const openCalendar = () => {
    const input = dateInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') input.showPicker();
    else input.click();
  };

  if (!profile || !log) return <div className="page-loading">Cargando tu día…</div>;
  const calories = log.calories ?? 0;
  const protein = log.protein_g ?? 0;
  const steps = log.steps ?? 0;
  const distanceKm = stepsToKm(steps, profile.height_cm, profile.steps_per_km);

  return (
    <div className="page-grid dashboard-page">
      <section className="page-heading">
        <div className="date-heading-wrap">
          <p className="eyebrow">{isToday ? 'HOY' : 'EDITANDO HISTORIAL'}</p>
          <button type="button" className="date-heading-button" onClick={openCalendar} aria-label="Elegir fecha">
            <h1>{prettyDate(selectedDate)}</h1><CalendarDays size={22} />
          </button>
          <input
            ref={dateInputRef}
            className="native-date-picker"
            type="date"
            value={selectedDate}
            max={today}
            onChange={(event) => { flushAutosave(); if (event.target.value) setSelectedDate(event.target.value); }}
          />
          <p className="muted">{isToday ? 'Toca la fecha para revisar o editar días anteriores.' : 'Esta fecha seguirá activa también en Entreno hasta que vuelvas a hoy.'}</p>
          {!isToday && <button type="button" className="link-button history-today-button" onClick={() => { flushAutosave(); resetToToday(); }}>Volver a hoy</button>}
        </div>
        <ScoreRing value={score} />
      </section>

      <section className="metric-grid">
        <article className="metric-card"><div className="metric-icon"><Scale /></div><div><span>Peso</span><strong>{log.weight_kg ?? '—'} <small>kg</small></strong></div></article>
        <article className="metric-card"><div className="metric-icon"><Activity /></div><div><span>Grasa estimada</span><strong>{bodyComposition ? `${bodyComposition.bodyFatPercentage.toFixed(1)}%` : '—'}</strong></div></article>
        <article className="metric-card"><div className="metric-icon orange"><Flame /></div><div><span>Calorías</span><strong>{calories.toLocaleString('es-CL')} <small>/ {profile.calories_target}</small></strong><ProgressBar value={calories} max={profile.calories_target} /></div></article>
        <article className="metric-card"><div className="metric-icon"><Zap /></div><div><span>Proteína</span><strong>{protein} <small>/ {profile.protein_target} g</small></strong><ProgressBar value={protein} max={profile.protein_target} /></div></article>
        <article className="metric-card"><div className="metric-icon"><Footprints /></div><div><span>Pasos</span><strong>{steps.toLocaleString('es-CL')} <small>/ {profile.steps_target}</small></strong><small className="metric-subvalue">{formatKm(distanceKm)} km estimados</small><ProgressBar value={steps} max={profile.steps_target} /></div></article>
      </section>

      <section className="panel checkin-panel">
        <div className="section-title">
          <div><p className="eyebrow">CHECK-IN</p><h2>Registro diario</h2></div>
          <span className={savedState === 'offline' ? 'status-chip orange' : 'status-chip'}>
            {savedState === 'saving' || saving ? 'Guardando…' : savedState === 'synced' ? <><Check size={15} /> Guardado</> : savedState === 'offline' ? <><CloudOff size={15} /> Guardado offline</> : 'Autoguardado'}
          </span>
        </div>
        <p className="muted small">Cada cambio se guarda automáticamente. No necesitas confirmar el registro.</p>
        <div className="form-grid">
          <label><span><Scale size={16} /> Peso (kg)</span><DecimalInput value={log.weight_kg} onValueChange={(value) => update('weight_kg', value)} /></label>
          <label><span><Ruler size={16} /> Cintura (cm)</span><DecimalInput value={log.waist_cm} onValueChange={(value) => update('waist_cm', value)} /></label>
          <label><span><Ruler size={16} /> Cuello (cm)</span><DecimalInput value={log.neck_cm ?? profile.neck_cm} onValueChange={(value) => update('neck_cm', value)} /><small className="field-help">Si no cambia, usa la medida guardada en Ajustes.</small></label>
          {profile.sex === 'female' && <label><span><Ruler size={16} /> Cadera (cm)</span><DecimalInput value={log.hip_cm ?? profile.hip_cm} onValueChange={(value) => update('hip_cm', value)} /><small className="field-help">Mide en la parte más ancha.</small></label>}
          <label><span><Flame size={16} /> Calorías</span><input inputMode="numeric" type="number" value={log.calories ?? ''} onChange={(e) => update('calories', numberOrNull(e.target.value))} /></label>
          <label><span><Zap size={16} /> Proteína (g)</span><input inputMode="numeric" type="number" value={log.protein_g ?? ''} onChange={(e) => update('protein_g', numberOrNull(e.target.value))} /></label>
          <StepDistanceInput
            steps={log.steps}
            heightCm={profile.height_cm}
            calibratedStepsPerKm={profile.steps_per_km}
            onStepsChange={(value) => update('steps', value)}
          />
        </div>
        <div className="rating-grid">
          <div><span><Moon size={16} /> Sueño</span><Rating value={log.sleep_score} onChange={(value) => update('sleep_score', value)} /></div>
          <div><span><Zap size={16} /> Energía</span><Rating value={log.energy_score} onChange={(value) => update('energy_score', value)} /></div>
          <div><span><Flame size={16} /> Hambre</span><Rating value={log.hunger_score} onChange={(value) => update('hunger_score', value)} /></div>
        </div>
        <div className="toggle-row"><span>¿Consumiste marihuana anoche?</span><div className="segmented"><button type="button" className={log.cannabis === true ? 'active' : ''} onClick={() => update('cannabis', true)}>Sí</button><button type="button" className={log.cannabis === false ? 'active' : ''} onClick={() => update('cannabis', false)}>No</button></div></div>
        <label>Notas rápidas<textarea rows={3} value={log.notes ?? ''} onChange={(e) => update('notes', e.target.value)} placeholder="Hambre, sueño, molestias, Shabat, comida afuera…" /></label>
        {error && <div className="alert error">{error}</div>}
      </section>

      <Link className="action-card" to="/entreno" onClick={flushAutosave}><div className="metric-icon"><Dumbbell /></div><div><span>Entrenamiento</span><strong>Ver rutina y registrar series</strong></div><ChevronRight /></Link>
    </div>
  );
}
