import { Activity, CalendarDays, Check, ChevronRight, CloudOff, Dumbbell, Flame, Footprints, Moon, Ruler, Save, Scale, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BodyCompositionCard } from '../components/BodyCompositionCard';
import { ProgressBar } from '../components/ProgressBar';
import { ScoreRing } from '../components/ScoreRing';
import { useAuth } from '../context/AuthContext';
import { useSelectedDate } from '../context/SelectedDateContext';
import { estimateBodyCompositionForLog } from '../lib/bodyFat';
import { prettyDate } from '../lib/date';
import { dailyScore, numberOrNull } from '../lib/helpers';
import { cacheDailyLog, cacheKeys, cacheProfile, getCached, saveMutation } from '../lib/offline';
import { getSupabase } from '../lib/supabase';
import type { DailyLog } from '../types';

function emptyLog(userId: string, date: string): DailyLog {
  return {
    id: crypto.randomUUID(), user_id: userId, log_date: date, weight_kg: null, waist_cm: null,
    neck_cm: null, hip_cm: null, sleep_score: null, energy_score: null, hunger_score: null,
    cannabis: null, calories: null, protein_g: null, steps: null, notes: null
  };
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
  const [savedState, setSavedState] = useState<'none' | 'synced' | 'offline'>('none');
  const [error, setError] = useState('');
  const dateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      setError('');
      setSavedState('none');
      const cached = await getCached<DailyLog>(cacheKeys.daily(user.id, selectedDate));
      if (!cancelled) setLog(cached ?? emptyLog(user.id, selectedDate));
      if (!navigator.onLine) return;
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
      const next = (data as DailyLog | null) ?? cached ?? emptyLog(user.id, selectedDate);
      setLog(next);
      await cacheDailyLog(next);
    })();
    return () => { cancelled = true; };
  }, [supabase, user, selectedDate]);

  const score = useMemo(() => dailyScore(log, profile), [log, profile]);
  const bodyComposition = useMemo(
    () => profile && log ? estimateBodyCompositionForLog(profile, log) : null,
    [profile, log]
  );

  const update = <K extends keyof DailyLog>(key: K, value: DailyLog[K]) => {
    setSavedState('none');
    setLog((current) => current ? { ...current, [key]: value } : current);
  };

  const openCalendar = () => {
    const input = dateInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') input.showPicker();
    else input.click();
  };

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

  const save = async () => {
    if (!log || !user) return;
    setSaving(true);
    setError('');
    const next: DailyLog = {
      ...log,
      id: log.id ?? crypto.randomUUID(),
      user_id: user.id,
      log_date: selectedDate
    };
    setLog(next);
    await cacheDailyLog(next);
    const dailyResult = await saveMutation({
      operation: 'upsert',
      table: 'daily_logs',
      payload: { ...next, updated_at: new Date().toISOString() },
      onConflict: 'user_id,log_date',
      dedupeKey: `daily:${user.id}:${selectedDate}`
    });
    const targetResult = await saveAutomaticTargets(next);
    setSavedState(dailyResult === 'synced' && targetResult === 'synced' ? 'synced' : 'offline');
    setSaving(false);
  };

  if (!profile || !log) return <div className="page-loading">Cargando tu día…</div>;
  const calories = log.calories ?? 0;
  const protein = log.protein_g ?? 0;
  const steps = log.steps ?? 0;

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
            onChange={(event) => event.target.value && setSelectedDate(event.target.value)}
          />
          <p className="muted">{isToday ? 'Toca la fecha para revisar o editar días anteriores.' : 'Esta fecha seguirá activa también en Entreno hasta que vuelvas a hoy.'}</p>
          {!isToday && <button type="button" className="link-button history-today-button" onClick={resetToToday}>Volver a hoy</button>}
        </div>
        <ScoreRing value={score} />
      </section>

      <section className="metric-grid">
        <article className="metric-card"><div className="metric-icon"><Scale /></div><div><span>Peso</span><strong>{log.weight_kg ?? '—'} <small>kg</small></strong></div></article>
        <article className="metric-card"><div className="metric-icon"><Activity /></div><div><span>Grasa estimada</span><strong>{bodyComposition ? `${bodyComposition.bodyFatPercentage.toFixed(1)}%` : '—'}</strong></div></article>
        <article className="metric-card"><div className="metric-icon orange"><Flame /></div><div><span>Calorías</span><strong>{calories.toLocaleString('es-CL')} <small>/ {profile.calories_target}</small></strong><ProgressBar value={calories} max={profile.calories_target} /></div></article>
        <article className="metric-card"><div className="metric-icon"><Zap /></div><div><span>Proteína</span><strong>{protein} <small>/ {profile.protein_target} g</small></strong><ProgressBar value={protein} max={profile.protein_target} /></div></article>
        <article className="metric-card"><div className="metric-icon"><Footprints /></div><div><span>Pasos</span><strong>{steps.toLocaleString('es-CL')} <small>/ {profile.steps_target}</small></strong><ProgressBar value={steps} max={profile.steps_target} /></div></article>
      </section>

      <section className="panel checkin-panel">
        <div className="section-title">
          <div><p className="eyebrow">CHECK-IN</p><h2>Registro diario</h2></div>
          <span className={savedState === 'offline' ? 'status-chip orange' : 'status-chip'}>
            {savedState === 'synced' ? <><Check size={15} /> Sincronizado</> : savedState === 'offline' ? <><CloudOff size={15} /> Guardado offline</> : 'Pendiente'}
          </span>
        </div>
        <div className="form-grid">
          <label><span><Scale size={16} /> Peso (kg)</span><input inputMode="decimal" type="number" step="0.1" value={log.weight_kg ?? ''} onChange={(e) => update('weight_kg', numberOrNull(e.target.value))} /></label>
          <label><span><Ruler size={16} /> Cintura (cm)</span><input inputMode="decimal" type="number" step="0.1" value={log.waist_cm ?? ''} onChange={(e) => update('waist_cm', numberOrNull(e.target.value))} /></label>
          <label><span><Ruler size={16} /> Cuello (cm)</span><input inputMode="decimal" type="number" step="0.1" value={log.neck_cm ?? profile.neck_cm ?? ''} onChange={(e) => update('neck_cm', numberOrNull(e.target.value))} /><small className="field-help">Si no cambia, usa la medida guardada en Ajustes.</small></label>
          {profile.sex === 'female' && <label><span><Ruler size={16} /> Cadera (cm)</span><input inputMode="decimal" type="number" step="0.1" value={log.hip_cm ?? profile.hip_cm ?? ''} onChange={(e) => update('hip_cm', numberOrNull(e.target.value))} /><small className="field-help">Mide en la parte más ancha.</small></label>}
          <label><span><Flame size={16} /> Calorías</span><input inputMode="numeric" type="number" value={log.calories ?? ''} onChange={(e) => update('calories', numberOrNull(e.target.value))} /></label>
          <label><span><Zap size={16} /> Proteína (g)</span><input inputMode="numeric" type="number" value={log.protein_g ?? ''} onChange={(e) => update('protein_g', numberOrNull(e.target.value))} /></label>
          <label><span><Footprints size={16} /> Pasos</span><input inputMode="numeric" type="number" value={log.steps ?? ''} onChange={(e) => update('steps', numberOrNull(e.target.value))} /></label>
        </div>
        <div className="rating-grid">
          <div><span><Moon size={16} /> Sueño</span><Rating value={log.sleep_score} onChange={(value) => update('sleep_score', value)} /></div>
          <div><span><Zap size={16} /> Energía</span><Rating value={log.energy_score} onChange={(value) => update('energy_score', value)} /></div>
          <div><span><Flame size={16} /> Hambre</span><Rating value={log.hunger_score} onChange={(value) => update('hunger_score', value)} /></div>
        </div>
        <div className="toggle-row"><span>¿Consumiste marihuana anoche?</span><div className="segmented"><button type="button" className={log.cannabis === true ? 'active' : ''} onClick={() => update('cannabis', true)}>Sí</button><button type="button" className={log.cannabis === false ? 'active' : ''} onClick={() => update('cannabis', false)}>No</button></div></div>
        <label>Notas rápidas<textarea rows={3} value={log.notes ?? ''} onChange={(e) => update('notes', e.target.value)} placeholder="Hambre, sueño, molestias, Shabat, comida afuera…" /></label>
        {error && <div className="alert error">{error}</div>}
        <button className="primary-button" onClick={save} disabled={saving}><Save size={18} /> {saving ? 'Guardando…' : `Guardar ${isToday ? 'el día' : 'esta fecha'}`}</button>
      </section>

      <BodyCompositionCard profile={profile} log={log} />
      <Link className="action-card" to="/entreno"><div className="metric-icon"><Dumbbell /></div><div><span>Entrenamiento</span><strong>Ver rutina y registrar series</strong></div><ChevronRight /></Link>
    </div>
  );
}
