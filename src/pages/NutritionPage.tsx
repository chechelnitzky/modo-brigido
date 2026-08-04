import { CheckCircle2, CloudOff, Flame, Plus, Salad, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ProgressBar } from '../components/ProgressBar';
import { useAuth } from '../context/AuthContext';
import { dateInTimezone } from '../lib/date';
import { numberOrNull } from '../lib/helpers';
import { cacheDailyLog, cacheKeys, getCached, saveMutation } from '../lib/offline';
import { getSupabase } from '../lib/supabase';
import type { DailyLog } from '../types';

const quickMeals = [
  { name: 'Batido de proteína', calories: 250, protein: 30 },
  { name: 'Pollo + ensalada', calories: 480, protein: 50 },
  { name: 'Atún + huevos', calories: 420, protein: 42 },
  { name: 'Cena Shabat estimada', calories: 800, protein: 55 }
];

function emptyLog(userId: string, date: string): DailyLog {
  return {
    id: crypto.randomUUID(), user_id: userId, log_date: date, weight_kg: null, waist_cm: null,
    sleep_score: null, energy_score: null, hunger_score: null, cannabis: null, calories: null,
    protein_g: null, steps: null, notes: null
  };
}

export function NutritionPage() {
  const supabase = getSupabase();
  const { user, profile } = useAuth();
  const today = dateInTimezone(profile?.timezone || 'America/Santiago');
  const [log, setLog] = useState<DailyLog | null>(null);
  const [saving, setSaving] = useState(false);
  const [offlineSaved, setOfflineSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const cached = await getCached<DailyLog>(cacheKeys.daily(user.id, today));
      if (!cancelled) setLog(cached ?? emptyLog(user.id, today));
      if (!navigator.onLine) return;
      const { data } = await supabase.from('daily_logs').select('*').eq('user_id', user.id).eq('log_date', today).maybeSingle();
      if (cancelled) return;
      const next = (data as DailyLog | null) ?? cached ?? emptyLog(user.id, today);
      setLog(next);
      await cacheDailyLog(next);
    })();
    return () => { cancelled = true; };
  }, [supabase, user, today]);

  if (!log || !profile || !user) return <div className="page-loading">Cargando nutrición…</div>;

  const save = async (next: DailyLog) => {
    const local = { ...next, id: next.id ?? crypto.randomUUID(), user_id: user.id, log_date: today };
    setLog(local);
    setSaving(true);
    await cacheDailyLog(local);
    const result = await saveMutation({
      operation: 'upsert', table: 'daily_logs', payload: { ...local, updated_at: new Date().toISOString() },
      onConflict: 'user_id,log_date', dedupeKey: `daily:${user.id}:${today}`
    });
    setOfflineSaved(result === 'queued');
    setSaving(false);
  };

  const addMeal = (calories: number, protein: number) => save({ ...log, calories: (log.calories ?? 0) + calories, protein_g: (log.protein_g ?? 0) + protein });

  return (
    <div className="page-grid">
      <section className="page-heading simple"><div><p className="eyebrow">NUTRICIÓN</p><h1>Lo que se mide, se controla</h1><p className="muted">No necesitas registrar cada hoja de lechuga: alcanza calorías y proteína.</p></div></section>
      <section className="two-column">
        <article className="panel nutrition-card"><div className="section-title"><div className="metric-icon orange"><Flame /></div><div><span>Calorías de hoy</span><h2>{log.calories ?? 0} / {profile.calories_target}</h2></div></div><ProgressBar value={log.calories ?? 0} max={profile.calories_target} /><p className="muted">Rango ideal: {profile.calories_target - 100}–{profile.calories_target + 100} kcal.</p><input type="number" value={log.calories ?? ''} onChange={(e) => setLog({ ...log, calories: numberOrNull(e.target.value) })} onBlur={() => save(log)} /></article>
        <article className="panel nutrition-card"><div className="section-title"><div className="metric-icon"><Zap /></div><div><span>Proteína de hoy</span><h2>{log.protein_g ?? 0} / {profile.protein_target} g</h2></div></div><ProgressBar value={log.protein_g ?? 0} max={profile.protein_target} /><p className="muted">Objetivo mínimo para apoyar la pérdida de grasa y el entrenamiento.</p><input type="number" value={log.protein_g ?? ''} onChange={(e) => setLog({ ...log, protein_g: numberOrNull(e.target.value) })} onBlur={() => save(log)} /></article>
      </section>

      <section className="panel"><div className="section-title"><div><p className="eyebrow">PLANTILLAS</p><h2>Agregar en un toque</h2></div><span className={offlineSaved ? 'status-chip orange' : 'status-chip'}>{saving ? 'Guardando…' : offlineSaved ? <><CloudOff size={14} /> Guardado offline</> : 'Sincronizado'}</span></div><div className="meal-grid">{quickMeals.map((meal) => <button className="meal-card" key={meal.name} onClick={() => addMeal(meal.calories, meal.protein)}><div className="meal-icon"><Salad /></div><div><strong>{meal.name}</strong><span>{meal.calories} kcal · {meal.protein} g proteína</span></div><Plus /></button>)}</div></section>

      <section className="habit-row"><div className={(log.calories ?? 0) >= profile.calories_target - 100 && (log.calories ?? 0) <= profile.calories_target + 100 ? 'habit done' : 'habit'}><CheckCircle2 /> Calorías dentro del rango</div><div className={(log.protein_g ?? 0) >= profile.protein_target ? 'habit done' : 'habit'}><CheckCircle2 /> Proteína cumplida</div></section>
    </div>
  );
}
