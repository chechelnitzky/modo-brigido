import { Award, CalendarDays, Flame, Footprints, Ruler, Scale, Trophy, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ProgressBar } from '../components/ProgressBar';
import { Sparkline } from '../components/Sparkline';
import { useAuth } from '../context/AuthContext';
import { average } from '../lib/helpers';
import { shortDate } from '../lib/date';
import { getSupabase } from '../lib/supabase';
import type { DailyLog } from '../types';

export function ProgressPage() {
  const supabase = getSupabase();
  const { user, profile } = useAuth();
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('daily_logs').select('*').eq('user_id', user.id).order('log_date'),
      supabase.from('workout_sessions').select('id,session_date,finished_at').eq('user_id', user.id).order('session_date')
    ]).then(([logResult, sessionResult]) => {
      setLogs((logResult.data ?? []) as DailyLog[]);
      setSessions(sessionResult.data ?? []);
      setLoading(false);
    });
  }, [supabase, user]);

  const metrics = useMemo(() => {
    const weightLogs = logs.filter((log) => log.weight_kg !== null);
    const waistLogs = logs.filter((log) => log.waist_cm !== null);
    const last7 = weightLogs.slice(-7).map((log) => Number(log.weight_kg));
    const previous7 = weightLogs.slice(-14, -7).map((log) => Number(log.weight_kg));
    const currentAvg = average(last7);
    const previousAvg = average(previous7);
    const weeklyRate = currentAvg !== null && previousAvg !== null ? currentAvg - previousAvg : null;
    const firstWeight = weightLogs[0]?.weight_kg ?? null;
    const currentWeight = weightLogs.at(-1)?.weight_kg ?? null;
    const firstWaist = waistLogs[0]?.waist_cm ?? null;
    const currentWaist = waistLogs.at(-1)?.waist_cm ?? null;
    return { weightLogs, waistLogs, currentAvg, weeklyRate, firstWeight, currentWeight, firstWaist, currentWaist };
  }, [logs]);

  if (loading || !profile) return <div className="page-loading">Calculando tu progreso…</div>;

  const adherenceDays = logs.filter((log) => {
    const caloriesOk = (log.calories ?? 0) >= profile.calories_target - 100 && (log.calories ?? 0) <= profile.calories_target + 100;
    return caloriesOk && (log.protein_g ?? 0) >= profile.protein_target && (log.steps ?? 0) >= profile.steps_target;
  }).length;
  const completedSessions = sessions.filter((session) => session.finished_at).length;
  const points = logs.length * 10 + adherenceDays * 60 + completedSessions * 30;

  return (
    <div className="page-grid">
      <section className="page-heading simple"><div><p className="eyebrow">PROGRESO</p><h1>La tendencia importa más que un día</h1><p className="muted">Usamos promedios y consistencia para evitar el ruido normal del peso.</p></div></section>

      <section className="two-column charts-grid">
        <article className="panel chart-card"><div className="section-title"><div><span>Peso promedio 7 días</span><h2>{metrics.currentAvg?.toFixed(1) ?? '—'} kg</h2></div><Scale /></div><Sparkline values={metrics.weightLogs.slice(-30).map((log) => Number(log.weight_kg))} labels={metrics.weightLogs.slice(-30).map((log) => shortDate(log.log_date))} /><div className="chart-footer"><span>Desde {metrics.firstWeight ?? '—'} kg</span><strong>{metrics.firstWeight && metrics.currentWeight ? `${(Number(metrics.currentWeight) - Number(metrics.firstWeight)).toFixed(1)} kg` : 'Sin comparación'}</strong></div></article>
        <article className="panel chart-card"><div className="section-title"><div><span>Cintura</span><h2>{metrics.currentWaist ?? '—'} cm</h2></div><Ruler /></div><Sparkline values={metrics.waistLogs.slice(-30).map((log) => Number(log.waist_cm))} labels={metrics.waistLogs.slice(-30).map((log) => shortDate(log.log_date))} /><div className="chart-footer"><span>Desde {metrics.firstWaist ?? '—'} cm</span><strong>{metrics.firstWaist && metrics.currentWaist ? `${(Number(metrics.currentWaist) - Number(metrics.firstWaist)).toFixed(1)} cm` : 'Sin comparación'}</strong></div></article>
      </section>

      <section className="metric-grid progress-metrics">
        <article className="metric-card"><div className="metric-icon orange"><Flame /></div><div><span>Ritmo semanal</span><strong>{metrics.weeklyRate === null ? '—' : `${metrics.weeklyRate.toFixed(2)} kg`}</strong></div></article>
        <article className="metric-card"><div className="metric-icon"><Trophy /></div><div><span>Puntos</span><strong>{points.toLocaleString('es-CL')}</strong></div></article>
        <article className="metric-card"><div className="metric-icon"><Award /></div><div><span>Días completos</span><strong>{adherenceDays}</strong></div></article>
        <article className="metric-card"><div className="metric-icon"><Zap /></div><div><span>Entrenamientos</span><strong>{completedSessions}</strong></div></article>
      </section>

      <section className="panel"><div className="section-title"><div><p className="eyebrow">ADHERENCIA</p><h2>Últimos 35 días</h2></div><CalendarDays /></div><div className="heatmap">{Array.from({ length: 35 }, (_, index) => {
        const log = logs.at(index - 35);
        if (!log) return <div className="heat-cell level-0" key={index} />;
        let level = 0;
        if (log.weight_kg !== null) level++;
        if ((log.protein_g ?? 0) >= profile.protein_target) level++;
        if ((log.steps ?? 0) >= profile.steps_target) level++;
        if ((log.calories ?? 0) >= profile.calories_target - 100 && (log.calories ?? 0) <= profile.calories_target + 100) level++;
        return <div title={log.log_date} className={`heat-cell level-${level}`} key={index} />;
      })}</div><div className="heat-legend"><span>Menos</span>{[0,1,2,3,4].map((level) => <i key={level} className={`heat-cell level-${level}`} />)}<span>Más</span></div></section>

      <section className="panel weekly-summary"><div><Footprints /><span>Promedio de pasos</span><strong>{Math.round(average(logs.slice(-7).map((log) => log.steps ?? 0)) ?? 0).toLocaleString('es-CL')}</strong><ProgressBar value={average(logs.slice(-7).map((log) => log.steps ?? 0)) ?? 0} max={profile.steps_target} /></div><div><Zap /><span>Promedio de proteína</span><strong>{Math.round(average(logs.slice(-7).map((log) => log.protein_g ?? 0)) ?? 0)} g</strong><ProgressBar value={average(logs.slice(-7).map((log) => log.protein_g ?? 0)) ?? 0} max={profile.protein_target} /></div></section>
    </div>
  );
}
