import { Check, ChevronRight, Dumbbell, Flame, Footprints, Moon, Ruler, Save, Scale, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ProgressBar } from '../components/ProgressBar';
import { ScoreRing } from '../components/ScoreRing';
import { useAuth } from '../context/AuthContext';
import { dateInTimezone, prettyDate } from '../lib/date';
import { dailyScore, numberOrNull } from '../lib/helpers';
import { getSupabase } from '../lib/supabase';
import type { DailyLog } from '../types';

function emptyLog(userId: string, date: string): DailyLog {
  return {
    user_id: userId,
    log_date: date,
    weight_kg: null,
    waist_cm: null,
    sleep_score: null,
    energy_score: null,
    hunger_score: null,
    cannabis: null,
    calories: null,
    protein_g: null,
    steps: null,
    notes: null
  };
}

function Rating({ value, onChange }: { value: number | null; onChange: (value: number) => void }) {
  return <div className="rating-row">{[1, 2, 3, 4, 5].map((item) => <button type="button" key={item} className={value === item ? 'rating active' : 'rating'} onClick={() => onChange(item)}>{item}</button>)}</div>;
}

export function TodayPage() {
  const supabase = getSupabase();
  const { user, profile } = useAuth();
  const today = dateInTimezone(profile?.timezone || 'America/Santiago');
  const [log, setLog] = useState<DailyLog | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    setLog(null);
    supabase.from('daily_logs').select('*').eq('user_id', user.id).eq('log_date', today).maybeSingle()
      .then(({ data, error: loadError }) => {
        if (loadError) setError(loadError.message);
        setLog(data ? data as DailyLog : emptyLog(user.id, today));
      });
  }, [supabase, user, today]);

  const score = useMemo(() => dailyScore(log, profile), [log, profile]);
  const update = <K extends keyof DailyLog>(key: K, value: DailyLog[K]) => {
    setSaved(false);
    setLog((current) => current ? { ...current, [key]: value } : current);
  };

  const save = async () => {
    if (!log || !user) return;
    setSaving(true);
    setError('');
    const payload = { ...log, user_id: user.id, log_date: today, updated_at: new Date().toISOString() };
    delete payload.id;
    const { data, error: saveError } = await supabase
      .from('daily_logs')
      .upsert(payload, { onConflict: 'user_id,log_date' })
      .select()
      .single();
    if (saveError) setError(saveError.message);
    else {
      setLog(data as DailyLog);
      setSaved(true);
    }
    setSaving(false);
  };

  if (!profile || !log) return <div className="page-loading">Cargando tu día…</div>;

  const calories = log.calories ?? 0;
  const protein = log.protein_g ?? 0;
  const steps = log.steps ?? 0;

  return (
    <div className="page-grid dashboard-page">
      <section className="page-heading">
        <div><p className="eyebrow">HOY</p><h1>{prettyDate(today)}</h1><p className="muted">Un día consistente vale más que un día perfecto.</p></div>
        <ScoreRing value={score} />
      </section>

      <section className="metric-grid">
        <article className="metric-card"><div className="metric-icon"><Scale /></div><div><span>Peso</span><strong>{log.weight_kg ?? '—'} <small>kg</small></strong></div></article>
        <article className="metric-card"><div className="metric-icon orange"><Flame /></div><div><span>Calorías</span><strong>{calories.toLocaleString('es-CL')} <small>/ {profile.calories_target}</small></strong><ProgressBar value={calories} max={profile.calories_target} /></div></article>
        <article className="metric-card"><div className="metric-icon"><Zap /></div><div><span>Proteína</span><strong>{protein} <small>/ {profile.protein_target} g</small></strong><ProgressBar value={protein} max={profile.protein_target} /></div></article>
        <article className="metric-card"><div className="metric-icon"><Footprints /></div><div><span>Pasos</span><strong>{steps.toLocaleString('es-CL')} <small>/ {profile.steps_target}</small></strong><ProgressBar value={steps} max={profile.steps_target} /></div></article>
      </section>

      <section className="panel checkin-panel">
        <div className="section-title"><div><p className="eyebrow">CHECK-IN</p><h2>Registro diario</h2></div><span className="status-chip">{saved ? <><Check size={15} /> Guardado</> : 'Pendiente'}</span></div>
        <div className="form-grid">
          <label><span><Scale size={16} /> Peso (kg)</span><input inputMode="decimal" type="number" step="0.1" value={log.weight_kg ?? ''} onChange={(e) => update('weight_kg', numberOrNull(e.target.value))} /></label>
          <label><span><Ruler size={16} /> Cintura (cm)</span><input inputMode="decimal" type="number" step="0.1" value={log.waist_cm ?? ''} onChange={(e) => update('waist_cm', numberOrNull(e.target.value))} /></label>
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
        <button className="primary-button" onClick={save} disabled={saving}><Save size={18} /> {saving ? 'Guardando…' : 'Guardar el día'}</button>
      </section>

      <Link className="action-card" to="/entreno"><div className="metric-icon"><Dumbbell /></div><div><span>Entrenamiento</span><strong>Ver rutina y registrar series</strong></div><ChevronRight /></Link>
    </div>
  );
}
