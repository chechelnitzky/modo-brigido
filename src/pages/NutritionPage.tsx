import { CloudOff, Flame, Info, RefreshCw, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSelectedDate } from '../context/SelectedDateContext';
import { useFatSecretDaily } from '../hooks/useFatSecretDaily';
import { prettyDate } from '../lib/date';
import { numberOrNull } from '../lib/helpers';
import { buildMealPlan, proteinFoods, sideFoods, suggestedMealTargets, type BuilderFood } from '../lib/mealBuilder';
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

function cookedPortion(food: BuilderFood, grams: number) {
  if (food.id === 'huevo') {
    const eggs = Math.max(1, Math.round(grams / 50));
    return `${eggs} huevo${eggs === 1 ? '' : 's'} (≈ ${eggs * 50} g)`;
  }
  return `${grams} g cocidos`;
}

function prepPortion(food: BuilderFood, amount: number) {
  if (food.prepMode === 'ready') return `${amount} g ${food.prepLabel}`;
  return `≈ ${amount} g ${food.prepLabel}`;
}

export function NutritionPage() {
  const supabase = getSupabase();
  const { user, profile } = useAuth();
  const { selectedDate, isToday } = useSelectedDate();
  const fatsecret = useFatSecretDaily(selectedDate);
  const [log, setLog] = useState<DailyLog | null>(null);
  const [category, setCategory] = useState<MealCategory>('Desayuno');
  const [builderProtein, setBuilderProtein] = useState('merluza');
  const [builderSide, setBuilderSide] = useState('arroz');
  const [saving, setSaving] = useState(false);
  const [offlineSaved, setOfflineSaved] = useState(false);
  const [fatsecretActionError, setFatsecretActionError] = useState('');
  const [connectionNotice, setConnectionNotice] = useState('');
  const logRef = useRef<DailyLog | null>(null);
  const timerRef = useRef<number | null>(null);
  const pendingRef = useRef<Partial<DailyLog>>({});

  useEffect(() => { logRef.current = log; }, [log]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('fatsecret');
    if (!result) return;
    if (result === 'connected') setConnectionNotice('FatSecret quedó conectado. Leyendo tu diario…');
    if (result === 'denied') setConnectionNotice('No se autorizó la conexión con FatSecret.');
    if (result === 'error') setConnectionNotice(params.get('fatsecret_message') || 'No se pudo conectar FatSecret.');
    window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`);
    void fatsecret.refresh();
  }, []);

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

  const calories = fatsecret.connected && fatsecret.calories != null ? fatsecret.calories : (log.calories ?? 0);
  const protein = fatsecret.connected && fatsecret.protein != null ? fatsecret.protein : (log.protein_g ?? 0);
  const proteinTarget = profile.protein_target || 160;
  const caloriesRemaining = Math.max(0, MEAL_CALORIE_TARGET - calories);
  const proteinRemaining = Math.max(0, proteinTarget - protein);
  const isBuilderCategory = category === 'Almuerzo' || category === 'Cena';
  const builderKind = category === 'Cena' ? 'Cena' : 'Almuerzo';
  const builderTargets = suggestedMealTargets(builderKind, caloriesRemaining, proteinRemaining);
  const builtMeal = isBuilderCategory ? buildMealPlan(builderProtein, builderSide, builderTargets.calories, builderTargets.protein) : null;

  const connectFatSecret = async () => {
    setFatsecretActionError('');
    try { await fatsecret.connect(); }
    catch (error) { setFatsecretActionError(error instanceof Error ? error.message : 'No se pudo conectar FatSecret.'); }
  };

  const disconnectFatSecret = async () => {
    setFatsecretActionError('');
    try { await fatsecret.disconnect(); }
    catch (error) { setFatsecretActionError(error instanceof Error ? error.message : 'No se pudo desconectar FatSecret.'); }
  };

  return (
    <div className="page-grid">
      <section className="page-heading simple">
        <div>
          <p className="eyebrow">{isToday ? 'NUTRICIÓN DE HOY' : 'NUTRICIÓN HISTÓRICA'}</p>
          <h1>{prettyDate(selectedDate)}</h1>
          <p className="muted">Elige primero la proteína y después el acompañamiento. Modo Bestia calcula una porción compatible con lo que te queda del día.</p>
        </div>
      </section>

      <section className="nutrition-summary-grid">
        <article className="nutrition-summary-card">
          <span className="summary-label"><Flame size={15} /> Calorías</span>
          <strong>{calories.toLocaleString('es-CL')}</strong>
          <small>de {MEAL_CALORIE_TARGET.toLocaleString('es-CL')} kcal · quedan {caloriesRemaining.toLocaleString('es-CL')}</small>
          {fatsecret.connected ? <span className="nutrition-live-source">FatSecret · {fatsecret.entriesCount} registro{fatsecret.entriesCount === 1 ? '' : 's'}</span> : <label className="nutrition-inline-input"><span className="muted small">Manual</span><input aria-label="Calorías consumidas" type="number" value={log.calories ?? ''} onChange={(e) => updateNutrition({ calories: numberOrNull(e.target.value) })} /></label>}
        </article>
        <article className="nutrition-summary-card">
          <span className="summary-label"><Zap size={15} /> Proteína</span>
          <strong>{protein.toLocaleString('es-CL')} g</strong>
          <small>de {proteinTarget} g · faltan {proteinRemaining.toLocaleString('es-CL')} g</small>
          {fatsecret.connected ? <button type="button" className="nutrition-refresh-button" onClick={() => void fatsecret.refresh()} disabled={fatsecret.loading}><RefreshCw size={14} /> {fatsecret.loading ? 'Actualizando…' : 'Actualizar FatSecret'}</button> : <label className="nutrition-inline-input"><span className="muted small">Manual</span><input aria-label="Proteína consumida" type="number" value={log.protein_g ?? ''} onChange={(e) => updateNutrition({ protein_g: numberOrNull(e.target.value) })} /></label>}
        </article>
      </section>

      <section className="panel fatsecret-panel">
        <div>
          <p className="eyebrow">FATSECRET · SOLO LECTURA</p>
          <h2>{fatsecret.connected ? 'Diario conectado' : 'Conecta tu diario'}</h2>
          <p className="muted small">Modo Bestia solo lee las calorías y proteína que registras en FatSecret. Nunca crea ni modifica comidas.</p>
        </div>
        <div className="fatsecret-actions">
          {fatsecret.connected
            ? <><span className="status-chip green">Conectado</span><button type="button" className="secondary-button" onClick={disconnectFatSecret}>Desconectar</button></>
            : <button type="button" className="primary-button" onClick={connectFatSecret} disabled={!fatsecret.configured}>Conectar FatSecret</button>}
        </div>
        {!fatsecret.configured && <div className="alert error">La integración está instalada, pero todavía faltan las credenciales de desarrollador de FatSecret en Supabase.</div>}
        {(fatsecret.error || fatsecretActionError) && <div className="alert error">{fatsecretActionError || fatsecret.error}</div>}
        {connectionNotice && <div className="alert success">{connectionNotice}</div>}
      </section>

      <section className="panel meal-library-panel">
        <div className="section-title">
          <div><p className="eyebrow">COMIDAS</p><h2>{isBuilderCategory ? 'Arma tu comida' : 'Elige una opción'}</h2></div>
          <span className={offlineSaved ? 'status-chip orange' : 'status-chip'}>{saving ? 'Guardando…' : offlineSaved ? <><CloudOff size={14} /> Offline</> : fatsecret.connected ? 'FatSecret activo' : 'Modo manual'}</span>
        </div>

        <div className="meal-category-tabs" role="tablist" aria-label="Tipo de comida">
          {mealCategories.map((item) => <button key={item} type="button" role="tab" aria-selected={category === item} className={category === item ? 'meal-category-tab active' : 'meal-category-tab'} onClick={() => setCategory(item)}>{item}</button>)}
        </div>

        <div className="meal-budget-strip">
          <span>Disponible para el resto del día</span>
          <strong>{caloriesRemaining.toLocaleString('es-CL')} kcal · {proteinRemaining.toLocaleString('es-CL')} g proteína por completar</strong>
        </div>

        {!isBuilderCategory ? <>
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
        </> : <div className="meal-builder">
          <div className="builder-step">
            <div className="builder-step-heading"><span>1</span><div><strong>¿Qué proteína quieres comer?</strong><small>Las legumbres también pueden ser proteína base.</small></div></div>
            <div className="builder-choice-grid">
              {proteinFoods.map((food) => <button key={food.id} type="button" className={builderProtein === food.id ? 'builder-choice active' : 'builder-choice'} onClick={() => setBuilderProtein(food.id)}><strong>{food.name}</strong><small>{food.proteinPer100Cooked} g P / 100 g</small></button>)}
            </div>
          </div>

          <div className="builder-step">
            <div className="builder-step-heading"><span>2</span><div><strong>¿Con qué lo quieres acompañar?</strong><small>Lentejas, garbanzos, porotos, edamame y habas suman proteína al cálculo.</small></div></div>
            <div className="builder-choice-grid compact">
              {sideFoods.map((food) => <button key={food.id} type="button" className={builderSide === food.id ? 'builder-choice active' : 'builder-choice'} onClick={() => setBuilderSide(food.id)}><strong>{food.name}</strong>{food.id !== 'none' && <small>{food.caloriesPer100Cooked} kcal / 100 g</small>}</button>)}
            </div>
          </div>

          <div className="builder-target-strip"><span>Objetivo sugerido para este {builderKind.toLowerCase()}</span><strong>≈ {builderTargets.calories} kcal · {builderTargets.protein} g proteína</strong></div>

          {builtMeal && <article className="built-meal-card">
            <div className="meal-option-top"><span className="meal-code">PORCIÓN SUGERIDA</span><span className="meal-condition">{builtMeal.proteinFood.condition}</span></div>
            <h3>{builtMeal.proteinFood.name}{builtMeal.sideFood ? ` + ${builtMeal.sideFood.name}` : ''}</h3>
            <div className="built-meal-portions">
              <div><span>Para comer</span><strong>{cookedPortion(builtMeal.proteinFood, builtMeal.proteinCookedG)}</strong><small>{builtMeal.sideFood ? `+ ${builtMeal.sideCookedG} g de ${builtMeal.sideFood.name.toLowerCase()} cocido` : 'sin acompañamiento'}</small></div>
              <div><span>Para cocinar</span><strong>{prepPortion(builtMeal.proteinFood, builtMeal.proteinPrepAmountG)}</strong><small>{builtMeal.sideFood ? `+ ${prepPortion(builtMeal.sideFood, builtMeal.sidePrepAmountG)} de ${builtMeal.sideFood.name.toLowerCase()}` : 'sin acompañamiento'}</small></div>
            </div>
            <div className="meal-option-footer">
              <div className="meal-nutrition"><div><strong>{builtMeal.calories}</strong><span>kcal</span></div><div><strong>{builtMeal.protein} g</strong><span>proteína</span></div></div>
              <span className={builtMeal.calories <= caloriesRemaining ? 'meal-fit-badge' : 'meal-fit-badge over'}>{builtMeal.calories <= caloriesRemaining ? 'Cabe hoy' : `+${builtMeal.calories - caloriesRemaining} kcal`}</span>
            </div>
            {(builtMeal.proteinFood.note || builtMeal.sideFood?.note) && <p className="meal-option-note">{builtMeal.proteinFood.note || builtMeal.sideFood?.note}</p>}
          </article>}
        </div>}

        <div className="nutrition-source-note"><Info size={16} /><span>Los gramos “para cocinar” usan factores de rendimiento aproximados. El peso cocido es la referencia nutricional; si después calibramos tu sartén, horno o air fryer, podremos afinar la conversión crudo → cocido.</span></div>
      </section>
    </div>
  );
}
