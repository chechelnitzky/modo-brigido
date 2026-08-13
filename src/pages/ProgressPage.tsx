import { Activity, ArrowDown, ArrowUp, Award, CalendarDays, Flame, Footprints, Minus, Ruler, Scale, Trophy, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { BodyCompositionCard } from '../components/BodyCompositionCard';
import { ProgressBar } from '../components/ProgressBar';
import { Sparkline } from '../components/Sparkline';
import { useAuth } from '../context/AuthContext';
import { estimateBodyCompositionForLog } from '../lib/bodyFat';
import { dateInTimezone, detectTimezone, shortDate } from '../lib/date';
import { average, totalSteps } from '../lib/helpers';
import { cacheDailyLogs, cacheKeys, getCached, setCached } from '../lib/offline';
import { getSupabase } from '../lib/supabase';
import type { DailyLog } from '../types';

type AnalysisLog = DailyLog & {
  carriedWeight: boolean;
  carriedWaist: boolean;
  syntheticDay: boolean;
};

function mergeLogsByDate(...lists: DailyLog[][]): DailyLog[] {
  const byDate = new Map<string, DailyLog>();
  for (const list of lists) {
    for (const log of list) {
      if (log?.log_date) byDate.set(log.log_date, log);
    }
  }
  return [...byDate.values()].sort((a, b) => a.log_date.localeCompare(b.log_date));
}

function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function sundayOfWeek(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}

function buildDailyAnalysisLogs(logs: DailyLog[], todayKey: string): AnalysisLog[] {
  const eligible = logs
    .filter((log) => log.log_date <= todayKey)
    .sort((a, b) => a.log_date.localeCompare(b.log_date));
  if (!eligible.length) return [];

  const firstUseful = eligible.find((log) => log.weight_kg !== null || log.waist_cm !== null);
  if (!firstUseful) return [];

  const byDate = new Map(eligible.map((log) => [log.log_date, log]));
  let lastWeight: number | null = null;
  let lastWaist: number | null = null;
  const result: AnalysisLog[] = [];

  for (let dateKey = firstUseful.log_date; dateKey <= todayKey; dateKey = shiftDateKey(dateKey, 1)) {
    const actual = byDate.get(dateKey) ?? null;
    const actualWeight = actual?.weight_kg ?? null;
    const actualWaist = actual?.waist_cm ?? null;

    if (actualWeight !== null) lastWeight = Number(actualWeight);
    if (actualWaist !== null) lastWaist = Number(actualWaist);

    const base: DailyLog = actual ?? {
      user_id: firstUseful.user_id,
      log_date: dateKey,
      weight_kg: null,
      waist_cm: null,
      neck_cm: null,
      hip_cm: null,
      sleep_score: null,
      energy_score: null,
      hunger_score: null,
      cannabis: null,
      calories: null,
      protein_g: null,
      steps: null,
      manual_steps: 0,
      notes: null
    };

    result.push({
      ...base,
      log_date: dateKey,
      weight_kg: actualWeight ?? lastWeight,
      waist_cm: actualWaist ?? lastWaist,
      carriedWeight: actualWeight === null && lastWeight !== null,
      carriedWaist: actualWaist === null && lastWaist !== null,
      syntheticDay: actual === null
    });
  }

  return result;
}

function fullDate(dateKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return dateKey;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

function localizedNumber(value: number, decimals = 1): string {
  return new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

function TrendDelta({ value, label }: { value: number | null; label: string }) {
  if (value === null || !Number.isFinite(value)) {
    return <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#92a097', fontSize: 12 }}><Minus size={15} /><span>{label}: sin comparación</span></div>;
  }

  const rounded = Math.abs(value) < 0.05 ? 0 : value;
  const isDown = rounded < 0;
  const isUp = rounded > 0;
  const Icon = isDown ? ArrowDown : isUp ? ArrowUp : Minus;
  const color = isDown ? '#70e448' : isUp ? '#ffad42' : '#92a097';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, color, fontSize: 12, fontWeight: 750 }}>
      <Icon size={16} />
      <strong>{localizedNumber(Math.abs(rounded), 1)} kg</strong>
      <span style={{ color: '#92a097', fontWeight: 500 }}>{label}</span>
    </div>
  );
}

export function ProgressPage() {
  const supabase = getSupabase();
  const { user, profile } = useAuth();
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const timezone = profile?.timezone || detectTimezone();
  const todayKey = dateInTimezone(timezone);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    void (async () => {
      const [cachedLogs, cachedSessions, cachedToday] = await Promise.all([
        getCached<DailyLog[]>(cacheKeys.dailyList(user.id)),
        getCached<any[]>(cacheKeys.sessions(user.id)),
        getCached<DailyLog>(cacheKeys.daily(user.id, todayKey))
      ]);

      const localLogs = mergeLogsByDate(cachedLogs ?? [], cachedToday ? [cachedToday] : []);
      if (!cancelled) {
        setLogs(localLogs);
        setSessions(cachedSessions ?? []);
        setLoading(false);
      }
      if (!navigator.onLine) return;

      const [logResult, sessionResult] = await Promise.all([
        supabase.from('daily_logs').select('*').eq('user_id', user.id).order('log_date'),
        supabase.from('workout_sessions').select('id,routine_id,session_date,finished_at,started_at').eq('user_id', user.id).order('session_date')
      ]);
      if (cancelled) return;

      const latestCachedToday = await getCached<DailyLog>(cacheKeys.daily(user.id, todayKey));
      const nextLogs = mergeLogsByDate(
        (logResult.data ?? []) as DailyLog[],
        latestCachedToday ? [latestCachedToday] : []
      );
      const nextSessions = sessionResult.data ?? [];
      setLogs(nextLogs);
      setSessions(nextSessions);
      await Promise.all([
        cacheDailyLogs(user.id, nextLogs),
        setCached(cacheKeys.sessions(user.id), nextSessions)
      ]);
    })();

    return () => { cancelled = true; };
  }, [supabase, user, todayKey]);

  const metrics = useMemo(() => {
    const eligibleLogs = logs.filter((log) => log.log_date <= todayKey);
    const analysisLogs = buildDailyAnalysisLogs(eligibleLogs, todayKey);
    const weightLogs = analysisLogs.filter((log) => log.weight_kg !== null);
    const waistLogs = analysisLogs.filter((log) => log.waist_cm !== null);

    // Las semanas son siempre domingo-sábado. La semana anterior queda fija como
    // referencia consolidada y la semana actual se promedia solo hasta hoy.
    // Los días sin medición heredan la última medición conocida únicamente para el análisis.
    const currentWeekStart = sundayOfWeek(todayKey);
    const currentWeekEnd = todayKey;
    const lastWeekEnd = shiftDateKey(currentWeekStart, -1);
    const lastWeekStart = shiftDateKey(lastWeekEnd, -6);
    const [todayYear, todayMonth, todayDay] = todayKey.split('-').map(Number);
    const currentWeekDaysElapsed = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay)).getUTCDay() + 1;

    const currentWeekWeights = weightLogs
      .filter((log) => log.log_date >= currentWeekStart && log.log_date <= currentWeekEnd)
      .map((log) => Number(log.weight_kg));
    const lastWeekWeights = weightLogs
      .filter((log) => log.log_date >= lastWeekStart && log.log_date <= lastWeekEnd)
      .map((log) => Number(log.weight_kg));

    const currentWeekAvg = average(currentWeekWeights);
    const lastWeekAvg = average(lastWeekWeights);
    const weeklyRate = currentWeekAvg !== null && lastWeekAvg !== null ? currentWeekAvg - lastWeekAvg : null;
    const firstWeight = weightLogs[0]?.weight_kg ?? null;
    const currentWeight = weightLogs.at(-1)?.weight_kg ?? null;
    const totalWeightChange = currentWeight !== null && firstWeight !== null ? Number(currentWeight) - Number(firstWeight) : null;
    const firstWaist = waistLogs[0]?.waist_cm ?? null;
    const currentWaist = waistLogs.at(-1)?.waist_cm ?? null;
    const bodyFatLogs = profile
      ? analysisLogs.flatMap((log) => {
          const estimate = estimateBodyCompositionForLog(profile, log);
          return estimate ? [{ log, estimate }] : [];
        })
      : [];

    return {
      analysisLogs,
      weightLogs,
      waistLogs,
      currentWeekAvg,
      lastWeekAvg,
      weeklyRate,
      totalWeightChange,
      firstWeight,
      currentWeight,
      firstWaist,
      currentWaist,
      currentWeekStart,
      currentWeekEnd,
      currentWeekDaysElapsed,
      lastWeekStart,
      lastWeekEnd,
      bodyFatLogs
    };
  }, [logs, profile, todayKey]);

  if (loading || !profile) return <div className="page-loading">Calculando tu progreso…</div>;

  const adherenceDays = logs.filter((log) => {
    const caloriesOk = (log.calories ?? 0) >= profile.calories_target - 100 && (log.calories ?? 0) <= profile.calories_target + 100;
    return caloriesOk && (log.protein_g ?? 0) >= profile.protein_target && totalSteps(log) >= profile.steps_target;
  }).length;
  const completedSessions = sessions.filter((session) => session.finished_at).length;
  const points = logs.length * 10 + adherenceDays * 60 + completedSessions * 30;
  const latestLog = logs.filter((log) => log.log_date <= todayKey).at(-1) ?? null;
  const latestBodyFat = metrics.bodyFatLogs.at(-1)?.estimate ?? null;

  const weightChart = metrics.weightLogs.slice(-30);
  const waistChart = metrics.waistLogs.slice(-30);
  const bodyFatChart = metrics.bodyFatLogs.slice(-30);
  const weeklySteps = logs.slice(-7).map((log) => totalSteps(log));
  const weeklyStepsAverage = average(weeklySteps) ?? 0;

  return <div className="page-grid">
    <section className="page-heading simple">
      <div>
        <p className="eyebrow">PROGRESO</p>
        <h1>La tendencia importa más que un día</h1>
        <p className="muted">Promedios y consistencia para evitar el ruido normal del peso.</p>
      </div>
    </section>

    <section className="two-column charts-grid">
      <article className="panel chart-card">
        <div className="section-title" style={{ alignItems: 'flex-start' }}>
          <div style={{ width: '100%' }}>
            <span>Peso promedio semanal</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 10 }}>
              <div style={{ padding: '10px 11px', borderRadius: 14, background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.06)' }}>
                <small className="muted" style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: '.08em' }}>ÚLTIMA SEMANA</small>
                <strong style={{ display: 'block', marginTop: 4, fontSize: 27, lineHeight: 1.05 }}>{metrics.lastWeekAvg?.toFixed(1) ?? '—'} kg</strong>
                <small className="muted" style={{ display: 'block', marginTop: 6, lineHeight: 1.25 }}>
                  {shortDate(metrics.lastWeekStart)}–{shortDate(metrics.lastWeekEnd)} · dom–sáb
                </small>
              </div>
              <div style={{ padding: '10px 11px', borderRadius: 14, background: 'rgba(112,228,72,.055)', border: '1px solid rgba(112,228,72,.22)' }}>
                <small style={{ display: 'block', color: '#70e448', fontSize: 10, fontWeight: 850, letterSpacing: '.08em' }}>ESTA SEMANA · EN CURSO</small>
                <strong style={{ display: 'block', marginTop: 4, fontSize: 27, lineHeight: 1.05 }}>{metrics.currentWeekAvg?.toFixed(1) ?? '—'} kg</strong>
                <small className="muted" style={{ display: 'block', marginTop: 6, lineHeight: 1.25 }}>
                  {shortDate(metrics.currentWeekStart)}–{shortDate(metrics.currentWeekEnd)} · {metrics.currentWeekDaysElapsed}/7 días
                </small>
              </div>
            </div>
          </div>
          <Scale style={{ flex: '0 0 auto', marginLeft: 8 }} />
        </div>
        <Sparkline
          values={weightChart.map((log) => Number(log.weight_kg))}
          labels={weightChart.map((log) => shortDate(log.log_date))}
          tooltipLabels={weightChart.map((log) => fullDate(log.log_date))}
          tooltipValues={weightChart.map((log) => `${localizedNumber(Number(log.weight_kg), 1)} kg${log.carriedWeight ? ' · repetido' : ''}`)}
          ariaLabel="Evolución del peso"
        />
        <div style={{ display: 'grid', gap: 8, marginTop: 15, paddingTop: 13, borderTop: '1px solid rgba(255,255,255,.06)' }}>
          <TrendDelta value={metrics.weeklyRate} label="promedio en curso vs. última semana" />
          <TrendDelta value={metrics.totalWeightChange} label="cambio total desde el inicio" />
        </div>
      </article>

      <article className="panel chart-card">
        <div className="section-title">
          <div><span>Cintura</span><h2>{metrics.currentWaist ?? '—'} cm</h2></div>
          <Ruler />
        </div>
        <Sparkline
          values={waistChart.map((log) => Number(log.waist_cm))}
          labels={waistChart.map((log) => shortDate(log.log_date))}
          tooltipLabels={waistChart.map((log) => fullDate(log.log_date))}
          tooltipValues={waistChart.map((log) => `${localizedNumber(Number(log.waist_cm), 1)} cm${log.carriedWaist ? ' · repetido' : ''}`)}
          ariaLabel="Evolución de la cintura"
        />
        <div className="chart-footer">
          <span>Desde {metrics.firstWaist ?? '—'} cm</span>
          <strong>{metrics.firstWaist !== null && metrics.currentWaist !== null ? `${(Number(metrics.currentWaist) - Number(metrics.firstWaist)).toFixed(1)} cm` : 'Sin comparación'}</strong>
        </div>
      </article>
    </section>

    <section className="panel chart-card bodyfat-chart-card">
      <div className="section-title">
        <div><p className="eyebrow">MÉTODO U.S. NAVY</p><h2>Grasa corporal estimada</h2></div>
        <Activity />
      </div>
      <Sparkline
        values={bodyFatChart.map((item) => item.estimate.bodyFatPercentage)}
        labels={bodyFatChart.map((item) => shortDate(item.log.log_date))}
        tooltipLabels={bodyFatChart.map((item) => fullDate(item.log.log_date))}
        tooltipValues={bodyFatChart.map((item) => `${localizedNumber(item.estimate.bodyFatPercentage, 1)}% grasa${item.log.carriedWeight || item.log.carriedWaist ? ' · repetido' : ''}`)}
        ariaLabel="Evolución del porcentaje de grasa corporal"
      />
      <div className="chart-footer">
        <span>Última estimación</span>
        <strong>{latestBodyFat ? `${latestBodyFat.bodyFatPercentage.toFixed(1)}% · ${latestBodyFat.category}` : 'Completa tus medidas'}</strong>
      </div>
    </section>

    <section className="metric-grid progress-metrics">
      <article className="metric-card"><div className="metric-icon orange"><Flame /></div><div><span>Vs. semana anterior</span><strong>{metrics.weeklyRate === null ? '—' : `${metrics.weeklyRate.toFixed(2)} kg`}</strong></div></article>
      <article className="metric-card"><div className="metric-icon"><Activity /></div><div><span>Peso por composición</span><strong>{latestBodyFat?.estimatedTargetWeightKg ? `${latestBodyFat.estimatedTargetWeightKg.toFixed(1)} kg` : '—'}</strong></div></article>
      <article className="metric-card"><div className="metric-icon"><Trophy /></div><div><span>Puntos</span><strong>{points.toLocaleString('es-CL')}</strong></div></article>
      <article className="metric-card"><div className="metric-icon"><Award /></div><div><span>Días completos</span><strong>{adherenceDays}</strong></div></article>
      <article className="metric-card"><div className="metric-icon"><Zap /></div><div><span>Entrenamientos</span><strong>{completedSessions}</strong></div></article>
    </section>

    {latestLog && <BodyCompositionCard profile={profile} log={latestLog} title="Última composición estimada" />}

    <section className="panel">
      <div className="section-title"><div><p className="eyebrow">ADHERENCIA</p><h2>Últimos 35 días</h2></div><CalendarDays /></div>
      <div className="heatmap">{Array.from({ length: 35 }, (_, index) => {
        const log = logs.at(index - 35);
        if (!log) return <div className="heat-cell level-0" key={index} />;
        let level = 0;
        if (log.weight_kg !== null) level++;
        if ((log.protein_g ?? 0) >= profile.protein_target) level++;
        if (totalSteps(log) >= profile.steps_target) level++;
        if ((log.calories ?? 0) >= profile.calories_target - 100 && (log.calories ?? 0) <= profile.calories_target + 100) level++;
        return <div title={log.log_date} className={`heat-cell level-${level}`} key={index} />;
      })}</div>
      <div className="heat-legend"><span>Menos</span>{[0, 1, 2, 3, 4].map((level) => <i key={level} className={`heat-cell level-${level}`} />)}<span>Más</span></div>
    </section>

    <section className="panel weekly-summary">
      <div><Footprints /><span>Promedio de pasos</span><strong>{Math.round(weeklyStepsAverage).toLocaleString('es-CL')}</strong><ProgressBar value={weeklyStepsAverage} max={profile.steps_target} /></div>
      <div><Zap /><span>Promedio de proteína</span><strong>{Math.round(average(logs.slice(-7).map((log) => log.protein_g ?? 0)) ?? 0)} g</strong><ProgressBar value={average(logs.slice(-7).map((log) => log.protein_g ?? 0)) ?? 0} max={profile.protein_target} /></div>
    </section>
  </div>;
}
