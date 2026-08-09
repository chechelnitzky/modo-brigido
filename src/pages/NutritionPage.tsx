import { CheckCircle2, CloudOff, Flame, Plus, Salad, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ProgressBar } from '../components/ProgressBar';
import { useAuth } from '../context/AuthContext';
import { useSelectedDate } from '../context/SelectedDateContext';
import { prettyDate } from '../lib/date';
import { numberOrNull } from '../lib/helpers';
import { cacheDailyLog, cacheKeys, getCached, saveMutation } from '../lib/offline';
import { getSupabase } from '../lib/supabase';
import type { DailyLog } from '../types';

const AUTOSAVE_DELAY_MS = 450;
const quickMeals = [
  { name: 'Batido de proteína', calories: 250, protein: 30 },
  { name: 'Pollo + ensalada', calories: 480, protein: 50 },
  { name: 'Atún + huevos', calories: 420, protein: 42 },
  { name: 'Cena Shabat estimada', calories: 800, protein: 55 }
];

function emptyLog(userId: string, date: string): DailyLog {
  return {
    id: crypto.randomUUID(), user_id: userId, log_date: date, weight_kg: null, waist_cm: null,
    neck_cm: null, hip_cm: null, sleep_score: null, energy_score: null, hunger_score: null,
    cannabis: null, calories: null, protein_g: null, steps: null, notes: null
  };
}

function mergeServerWithLocal(server: DailyLog, local: DailyLog | null): DailyLog {
  if (!local) return server;
  const next = { ...server } as DailyLog;
  for (const key of ['weight_kg', 'waist_cm', 'neck_cm', 'hip_cm', 'sleep_score', 'energy_score', 'hunger_score', 'cannabis', 'calories', 'protein_g', 'notes'] as Array<keyof DailyLog>) {
    if ((server as any)[key] == null && (local as any)[key] != null) (next as any)[key] = (local as any)[key];
  }
  if ((server.steps ?? 0) === 0 && (local.steps ?? 0) > 0) next.steps = local.steps;
  return next;
}

export function NutritionPage() {
  const supabase = getSupabase();
  const { user, profile } = useAuth();
  const { selectedDate, isToday } = useSelectedDate();
  const [log, setLog] = useState<DailyLog | null>(null);
  const [saving, setSaving] = useState(false);
  const [offlineSaved, setOfflineSaved] = useState(false);
  const logRef = useRef<DailyLog | null>(null);
  const timerRef = useRef<number | null>(null);
  const pendingRef = useRef<Partial<DailyLog>>({});

  useEffect(() => { logRef.current = log; }, [log]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    pendingRef.current = {};
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    void (async () => {
      const cached = await getCached<DailyLog>(cacheKeys.daily(user.id, selectedDate));
      if (!cancelled) {
        const first = cached ?? emptyLog(user.id, selectedDate);
        logRef.current = first;
        setLog(first);
      }
      if (!navigator.onLine) return;
      const { data } = await supabase.from('daily_logs').select('*').eq('user_id', user.id).eq('log_date', selectedDate).maybeSingle();
      if (cancelled) return;
      const server = data as DailyLog | null;
      const next = server ? mergeServerWithLocal(server, cached) : cached ?? emptyLog(user.id, selectedDate);
      logRef.current = next;
      setLog(next);
      await cacheDailyLog(next);
    })();
    return () => { cancelled = true; };
  }, [supabase, user, selectedDate]);

  if (!log || !profile || !user) return <div className="page-loading">Cargando nutrición…</div>;

  const flush = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    const patch = pendingRef.current;
    pendingRef.current = {};
    if (!Object.keys(patch).length) return;
    setSaving(true);
    void saveMutation({
      operation: 'upsert',
      table: 'daily_logs',
      payload: { user_id: user.id, log_date: selectedDate, ...patch, updated_at: new Date().toISOString() },
      onConflict: 'user_id,log_date',
      dedupeKey: `nutrition-autosave:${user.id}:${selectedDate}`
    }).then((result) => setOfflineSaved(result === 'queued')).finally(() => setSaving(false));
  };

  const updateNutrition = (patch: Partial<DailyLog>) => {
    setLog((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      logRef.current = next;
      void cacheDailyLog(next);
      return next;
    });
    pendingRef.current = { ...pendingRef.current, ...patch };
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flush, AUTOSAVE_DELAY_MS);
  };

  const addMeal = (calories: number, protein: number) => updateNutrition({
    calories: (log.calories ?? 0) + calories,
    protein_g: (log.protein_g ?? 0) + protein
  });

  return (
    <div className="page-grid">
      <section className="page-heading simple"><div><p className="eyebrow">{isToday ? 'NUTRICIÓN DE HOY' : 'NUTRICIÓN HISTÓRICA'}</p><h1>{prettyDate(selectedDate)}</h1><p className="muted">Alcanza calorías y proteína sin complicarte. Todo se guarda automáticamente.</p></div></section>
      <section className="two-column">
        <article className="panel nutrition-card"><div className="section-title"><div className="metric-icon orange"><Flame /></div><div><span>Calorías de esta fecha</span><h2>{log.calories ?? 0} / {profile.calories_target}</h2></div></div><ProgressBar value={log.calories ?? 0} max={profile.calories_target} /><p className="muted">Rango ideal: {profile.calories_target - 100}–{profile.calories_target + 100} kcal.</p><input type="number" value={log.calories ?? ''} onChange={(e) => updateNutrition({ calories: numberOrNull(e.target.value) })} /></article>
        <article className="panel nutrition-card"><div className="section-title"><div className="metric-icon"><Zap /></div><div><span>Proteína de esta fecha</span><h2>{log.protein_g ?? 0} / {profile.protein_target} g</h2></div></div><ProgressBar value={log.protein_g ?? 0} max={profile.protein_target} /><p className="muted">Objetivo mínimo para apoyar el entrenamiento.</p><input type="number" value={log.protein_g ?? ''} onChange={(e) => updateNutrition({ protein_g: numberOrNull(e.target.value) })} /></article>
      </section>
      <section className="panel"><div className="section-title"><div><p className="eyebrow">PLANTILLAS</p><h2>Agregar en un toque</h2></div><span className={offlineSaved ? 'status-chip orange' : 'status-chip'}>{saving ? 'Guardando…' : offlineSaved ? <><CloudOff size={14} /> Guardado offline</> : 'Autoguardado'}</span></div><div className="meal-grid">{quickMeals.map((meal) => <button className="meal-card" key={meal.name} onClick={() => addMeal(meal.calories, meal.protein)}><div className="meal-icon"><Salad /></div><div><strong>{meal.name}</strong><span>{meal.calories} kcal · {meal.protein} g proteína</span></div><Plus /></button>)}</div></section>
      <section className="habit-row"><div className={(log.calories ?? 0) >= profile.calories_target - 100 && (log.calories ?? 0) <= profile.calories_target + 100 ? 'habit done' : 'habit'}><CheckCircle2 /> Calorías dentro del rango</div><div className={(log.protein_g ?? 0) >= profile.protein_target ? 'habit done' : 'habit'}><CheckCircle2 /> Proteína cumplida</div></section>
    </div>
  );
}
