import { CloudOff, Flame, Info, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSelectedDate } from '../context/SelectedDateContext';
import { prettyDate } from '../lib/date';
import { numberOrNull } from '../lib/helpers';
import { MEAL_CALORIE_TARGET, mealCategories, mealLibrary, type MealCategory } from '../lib/mealLibrary';
import { cacheDailyLog, cacheKeys, getCached, saveMutation } from '../lib/offline';
import { getSupabase } from '../lib/supabase';
import type { DailyLog } from '../types';
import '../nutrition-library.css';

const AUTOSAVE_DELAY_MS = 450;

function emptyLog(userId: string, date: string): DailyLog {
  return {
    id: crypto.randomUUID(), user_id: userId, log_date: date, weight_kg: null, waist_cm: null,
    neck_cm: null, hip_cm: null, sleep_score: null, energy_score: null, hunger_score: null,
    cannabis: null, calories: null, protein_g: null, steps: null, manual_steps: 0, notes: null
  };
}

function mergeServerWithLocal(server: DailyLog, local: DailyLog | null): DailyLog {
  if (!local) return server;
  const next = { ...server } as DailyLog;
  for (const key of ['weight_kg', 'waist_cm', 'neck_cm', 'hip_cm', 'sleep_score', 'energy_score', 'hunger_score', 'cannabis', 'calories', 'protein_g', 'notes'] as Array<keyof DailyLog>) {
    if ((server as any)[key] == null && (local as any)[key] != null) (next as any)[key] = (local as any)[key];
  }
  if ((server.steps ?? 0) === 0 && (local.steps ?? 0) > 0) next.steps = local.steps;
  if ((server.manual_steps ?? 0) === 0 && (local.manual_steps ?? 0) > 0) next.manual_steps = local.manual_steps;
  return next;
}

export function NutritionPage() {
  const supabase = getSupabase();
  const { user, profile } = useAuth();
  const { selectedDate, isToday } = useSelectedDate();
  const [log, setLog] = useState<DailyLog | null>(null);
  const [category, setCategory] = useState<MealCategory>('Desayuno');
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

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    const patch = pendingRef.current;
    pendingRef.current = {};
    if (user && Object.keys(patch).length) {
      void saveMutation({
        operation: 'upsert',
        table: 'daily_logs',
        payload: { user_id: user.id, log_date: selectedDate, ...patch, updated_at: new Date().toISOString() },
        onConflict: 'user_id,log_date',
        dedupeKey: `nutrition-autosave:${user.id}:${selectedDate}`
      });
    }
  }, [user, selectedDate]);

  const meals = useMemo(() => mealLibrary.filter((meal) => meal.category === category), [category]);

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

  const calories = log.calories ?? 0;
  const protein = log.protein_g ?? 0;
  const proteinTarget = profile.protein_target || 160;
  const caloriesRemaining = Math.max(0, MEAL_CALORIE_TARGET - calories);
  const proteinRemaining = Math.max(0, proteinTarget - protein);

  return (
    <div className="page-grid">
      <section className="page-heading simple">
        <div>
          <p className="eyebrow">{isToday ? 'NUTRICIÓN DE HOY' : 'NUTRICIÓN HISTÓRICA'}</p>
          <h1>{prettyDate(selectedDate)}</h1>
          <p className="muted">Opciones kosher altas en proteína para construir el día sin tener que abrir el Excel.</p>
        </div>
      </section>

      <section className="nutrition-summary-grid">
        <article className="nutrition-summary-card">
          <span className="summary-label"><Flame size={15} /> Calorías</span>
          <strong>{calories.toLocaleString('es-CL')}</strong>
          <small>de {MEAL_CALORIE_TARGET.toLocaleString('es-CL')} kcal · quedan {caloriesRemaining.toLocaleString('es-CL')}</small>
          <label className="nutrition-inline-input"><span className="muted small">Registro</span><input aria-label="Calorías consumidas" type="number" value={log.calories ?? ''} onChange={(e) => updateNutrition({ calories: numberOrNull(e.target.value) })} /></label>
        </article>
        <article className="nutrition-summary-card">
          <span className="summary-label"><Zap size={15} /> Proteína</span>
          <strong>{protein.toLocaleString('es-CL')} g</strong>
          <small>de {proteinTarget} g · faltan {proteinRemaining.toLocaleString('es-CL')} g</small>
          <label className="nutrition-inline-input"><span className="muted small">Registro</span><input aria-label="Proteína consumida" type="number" value={log.protein_g ?? ''} onChange={(e) => updateNutrition({ protein_g: numberOrNull(e.target.value) })} /></label>
        </article>
      </section>

      <section className="panel meal-library-panel">
        <div className="section-title">
          <div><p className="eyebrow">OPCIONES DE MENÚ</p><h2>¿Qué quieres comer?</h2></div>
          <span className={offlineSaved ? 'status-chip orange' : 'status-chip'}>{saving ? 'Guardando…' : offlineSaved ? <><CloudOff size={14} /> Offline</> : `${mealLibrary.length} opciones`}</span>
        </div>

        <div className="meal-category-tabs" role="tablist" aria-label="Tipo de comida">
          {mealCategories.map((item) => <button key={item} type="button" role="tab" aria-selected={category === item} className={category === item ? 'meal-category-tab active' : 'meal-category-tab'} onClick={() => setCategory(item)}>{item}</button>)}
        </div>

        <div className="meal-budget-strip">
          <span>Disponible para el resto del día</span>
          <strong>{caloriesRemaining.toLocaleString('es-CL')} kcal · {proteinRemaining.toLocaleString('es-CL')} g proteína por completar</strong>
        </div>

        <div className="meal-swipe-hint"><span>{meals.length} opciones de {category.toLowerCase()}</span><span>Desliza para ver más →</span></div>

        <div className="meal-card-rail">
          {meals.map((meal) => {
            const overBy = meal.calories - caloriesRemaining;
            const fits = overBy <= 0;
            return <article className="meal-option-card" key={meal.code}>
              <div className="meal-option-top"><span className="meal-code">{meal.code}</span><span className="meal-condition">{meal.condition}</span></div>
              <h3>{meal.name}</h3>
              <p className="meal-option-details">{meal.details}</p>
              {meal.note && <p className="meal-option-note">{meal.note}</p>}
              <div className="meal-option-footer">
                <div className="meal-nutrition">
                  <div><strong>{meal.calories}</strong><span>kcal</span></div>
                  <div><strong>{meal.protein} g</strong><span>proteína</span></div>
                </div>
                <span className={fits ? 'meal-fit-badge' : 'meal-fit-badge over'}>{fits ? 'Cabe hoy' : `+${overBy} kcal`}</span>
              </div>
            </article>;
          })}
        </div>

        <div className="nutrition-source-note"><Info size={16} /><span>Estas tarjetas son una guía de porciones. Registra en FatSecret lo que realmente prepares y comas; Modo Bestia no agrega alimentos automáticamente.</span></div>
      </section>
    </div>
  );
}
