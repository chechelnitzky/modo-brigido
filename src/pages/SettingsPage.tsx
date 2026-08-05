import { Activity, Download, Footprints, LogOut, RotateCcw, Ruler, Save, Server, Settings, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { clearAppConfig } from '../lib/config';
import { dateInTimezone, detectTimezone } from '../lib/date';
import { estimateBodyCompositionForLog } from '../lib/bodyFat';
import { numberOrNull } from '../lib/helpers';
import { getSupabase } from '../lib/supabase';
import { cacheKeys, cacheProfile, getCached, saveMutation } from '../lib/offline';
import { getStepConversion } from '../lib/steps';
import type { DailyLog, Profile, Sex } from '../types';

export function SettingsPage() {
  const supabase = getSupabase();
  const { user, profile, refreshProfile, signOut } = useAuth();
  const [form, setForm] = useState<Profile | null>(profile);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(profile);
  }, [profile]);

  useEffect(() => {
    if (!profile || !user) return;
    let cancelled = false;
    void (async () => {
      const today = dateInTimezone(profile.timezone);
      let log = await getCached<DailyLog>(cacheKeys.daily(user.id, today));
      if (navigator.onLine) {
        const { data } = await supabase.from('daily_logs').select('*').eq('user_id', user.id).eq('log_date', today).maybeSingle();
        log = (data as DailyLog | null) ?? log;
      }
      if (cancelled || !log) return;
      const estimate = estimateBodyCompositionForLog(profile, log);
      if (!estimate?.estimatedTargetWeightKg || !estimate.estimatedTargetWaistCm) return;
      setForm((current) => current ? {
        ...current,
        weight_target: estimate.estimatedTargetWeightKg,
        waist_target: estimate.estimatedTargetWaistCm
      } : current);
    })();
    return () => { cancelled = true; };
  }, [profile, user, supabase]);

  if (!form || !profile || !user) return <div className="page-loading">Cargando ajustes…</div>;

  const stepConversion = getStepConversion(form.height_cm, form.steps_per_km);
  const stepLengthCm = stepConversion.stepLengthMeters * 100;
  const targetDistanceKm = form.steps_target / stepConversion.stepsPerKm;

  const save = async () => {
    setError('');
    setMessage('');
    const next = { ...form, id: user.id };
    await cacheProfile(next);
    const result = await saveMutation({
      operation: 'update',
      table: 'profiles',
      payload: {
        display_name: next.display_name,
        timezone: next.timezone,
        calories_target: next.calories_target,
        protein_target: next.protein_target,
        steps_target: next.steps_target,
        weight_target: next.weight_target,
        waist_target: next.waist_target,
        sex: next.sex,
        birth_date: next.birth_date,
        height_cm: next.height_cm,
        neck_cm: next.neck_cm,
        hip_cm: next.sex === 'female' ? next.hip_cm : null,
        steps_per_km: next.steps_per_km,
        updated_at: new Date().toISOString()
      },
      match: { id: user.id },
      dedupeKey: `profile:${user.id}`
    });
    await refreshProfile();
    setMessage(result === 'synced' ? 'Perfil y metas guardados.' : 'Perfil guardado en el dispositivo. Se sincronizará al volver internet.');
  };

  const exportData = async () => {
    setMessage('Preparando respaldo…');
    const tables = ['daily_logs', 'routine_templates', 'workout_sessions', 'meal_templates', 'walking_sessions'];
    const backup: Record<string, unknown> = { version: 2, exported_at: new Date().toISOString(), profile };
    for (const table of tables) {
      const { data } = await supabase.from(table).select('*').eq('user_id', user.id);
      backup[table] = data ?? [];
    }
    const routineIds = (backup.routine_templates as any[]).map((item) => item.id);
    backup.routine_exercises = routineIds.length ? (await supabase.from('routine_exercises').select('*').in('routine_id', routineIds)).data ?? [] : [];
    const sessionIds = (backup.workout_sessions as any[]).map((item) => item.id);
    backup.workout_exercises = sessionIds.length ? (await supabase.from('workout_exercises').select('*').in('session_id', sessionIds)).data ?? [] : [];
    const workoutExerciseIds = (backup.workout_exercises as any[]).map((item) => item.id);
    backup.workout_sets = workoutExerciseIds.length ? (await supabase.from('workout_sets').select('*').in('workout_exercise_id', workoutExerciseIds)).data ?? [] : [];
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `modo-brigido-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage('Respaldo descargado.');
  };

  const importData = async (file: File) => {
    setError('');
    setMessage('Importando…');
    try {
      const backup = JSON.parse(await file.text());
      if (backup.profile) {
        const { id: _oldId, ...settings } = backup.profile;
        await supabase.from('profiles').update(settings).eq('id', user.id);
      }
      for (const table of ['daily_logs', 'routine_templates', 'workout_sessions', 'meal_templates', 'walking_sessions']) {
        const rows = Array.isArray(backup[table]) ? backup[table].map((row: any) => ({ ...row, user_id: user.id })) : [];
        if (rows.length) await supabase.from(table).upsert(rows, { onConflict: 'id' });
      }
      for (const table of ['routine_exercises', 'workout_exercises', 'workout_sets']) {
        const rows = Array.isArray(backup[table]) ? backup[table] : [];
        if (rows.length) await supabase.from(table).upsert(rows, { onConflict: 'id' });
      }
      await refreshProfile();
      setMessage('Respaldo importado. Recarga la página para ver todo.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'El archivo no es válido.');
    }
  };

  const setSex = (sex: Sex) => setForm({ ...form, sex, hip_cm: sex === 'female' ? form.hip_cm : null });

  return (
    <div className="page-grid">
      <section className="page-heading simple"><div><p className="eyebrow">AJUSTES</p><h1>Tu plan, tus metas</h1><p className="muted">Cada cuenta tiene objetivos y datos completamente separados.</p></div></section>
      <section className="panel">
        <div className="section-title"><div><p className="eyebrow">PERFIL</p><h2>Metas diarias</h2></div><Settings /></div>
        <div className="form-grid">
          <label>Nombre<input value={form.display_name ?? ''} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></label>
          <label>Zona horaria<div className="input-action"><input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} /><button className="secondary-button compact" onClick={() => setForm({ ...form, timezone: detectTimezone() })}>Detectar</button></div></label>
          <label>Calorías objetivo<input type="number" value={form.calories_target} onChange={(e) => setForm({ ...form, calories_target: Number(e.target.value) })} /></label>
          <label>Proteína objetivo (g)<input type="number" value={form.protein_target} onChange={(e) => setForm({ ...form, protein_target: Number(e.target.value) })} /></label>
          <label>Pasos por día<input type="number" value={form.steps_target} onChange={(e) => setForm({ ...form, steps_target: Number(e.target.value) })} /></label>
          <label>Peso meta automático (kg)<input type="number" step="0.1" value={form.weight_target ?? ''} onChange={(e) => setForm({ ...form, weight_target: numberOrNull(e.target.value) })} /><small className="field-help">Se completa al guardar el check-in de hoy con el peso ideal Jackson & Pollock.</small></label>
          <label>Cintura meta automática (cm)<input type="number" step="0.1" value={form.waist_target ?? ''} onChange={(e) => setForm({ ...form, waist_target: numberOrNull(e.target.value) })} /><small className="field-help">Se calcula despejando la fórmula U.S. Navy al porcentaje ideal.</small></label>
        </div>
      </section>

      <section className="panel bodyfat-settings">
        <div className="section-title"><div><p className="eyebrow">COMPOSICIÓN CORPORAL</p><h2>Configuración U.S. Navy</h2></div><Activity /></div>
        <p className="muted">La estimación diaria combina tu peso y cintura del check-in con estas medidas base.</p>
        <div className="form-grid">
          <label>Sexo para la fórmula<div className="segmented full"><button type="button" className={form.sex === 'male' ? 'active' : ''} onClick={() => setSex('male')}>Hombre</button><button type="button" className={form.sex === 'female' ? 'active' : ''} onClick={() => setSex('female')}>Mujer</button></div></label>
          <label>Fecha de nacimiento<input type="date" value={form.birth_date ?? ''} onChange={(e) => setForm({ ...form, birth_date: e.target.value || null })} /></label>
          <label><span><Ruler size={16} /> Altura (cm)</span><input type="number" step="0.1" value={form.height_cm ?? ''} onChange={(e) => setForm({ ...form, height_cm: numberOrNull(e.target.value) })} /></label>
          <label><span><Ruler size={16} /> Cuello base (cm)</span><input type="number" step="0.1" value={form.neck_cm ?? ''} onChange={(e) => setForm({ ...form, neck_cm: numberOrNull(e.target.value) })} /><small className="field-help">Mide bajo la laringe, horizontal y sin apretar.</small></label>
          {form.sex === 'female' && <label><span><Ruler size={16} /> Cadera base (cm)</span><input type="number" step="0.1" value={form.hip_cm ?? ''} onChange={(e) => setForm({ ...form, hip_cm: numberOrNull(e.target.value) })} /><small className="field-help">Mide la zona de mayor circunferencia.</small></label>}
        </div>
        <div className="alert success">Al guardar el registro de hoy, la app actualizará automáticamente el peso meta y la cintura meta.</div>
      </section>

      <section className="panel step-calibration-panel">
        <div className="section-title"><div><p className="eyebrow">CAMINATA</p><h2>Conversión pasos y kilómetros</h2></div><Footprints /></div>
        <p className="muted">La app estima la longitud de cada paso con tu altura × 0,415. Puedes reemplazar esa estimación caminando 1 km real y anotando cuántos pasos hiciste.</p>
        <div className="step-calibration-grid">
          <label>
            Pasos medidos en 1 km
            <input
              type="number"
              inputMode="numeric"
              min="500"
              max="3000"
              step="1"
              value={form.steps_per_km ?? ''}
              placeholder={Math.round(getStepConversion(form.height_cm, null).stepsPerKm).toString()}
              onChange={(event) => setForm({ ...form, steps_per_km: numberOrNull(event.target.value) })}
            />
            <small className="field-help">Déjalo vacío para seguir usando la estimación automática por altura.</small>
          </label>
          <div className="step-calibration-summary">
            <span>{stepConversion.source === 'calibrated' ? 'Calibración personalizada activa' : stepConversion.source === 'height' ? 'Estimación actual por altura' : 'Estimación estándar temporal'}</span>
            <strong>1 paso ≈ {stepLengthCm.toLocaleString('es-CL', { maximumFractionDigits: 1 })} cm</strong>
            <strong>1 km ≈ {Math.round(stepConversion.stepsPerKm).toLocaleString('es-CL')} pasos</strong>
            <small>Tu meta de {form.steps_target.toLocaleString('es-CL')} pasos equivale a {targetDistanceKm.toLocaleString('es-CL', { maximumFractionDigits: 2 })} km.</small>
          </div>
        </div>
        {form.steps_per_km && <button type="button" className="secondary-button compact step-calibration-reset" onClick={() => setForm({ ...form, steps_per_km: null })}><RotateCcw size={15} /> Volver al cálculo por altura</button>}
      </section>

      <button className="primary-button settings-save" onClick={save}><Save size={18} /> Guardar perfil y metas</button>
      <section className="panel"><div className="section-title"><div><p className="eyebrow">DATOS</p><h2>Respaldo e importación</h2></div><Server /></div><p className="muted">Supabase guarda la información en línea. Este respaldo JSON te da una copia adicional independiente.</p><div className="button-row"><button className="secondary-button" onClick={exportData}><Download size={17} /> Exportar respaldo</button><button className="secondary-button" onClick={() => fileRef.current?.click()}><Upload size={17} /> Importar respaldo</button><input hidden ref={fileRef} type="file" accept="application/json" onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} /></div></section>
      {message && <div className="alert success">{message}</div>}{error && <div className="alert error">{error}</div>}
      <section className="danger-zone"><button className="secondary-button" onClick={signOut}><LogOut size={17} /> Cerrar sesión</button><button className="danger-button" onClick={() => { clearAppConfig(); window.location.reload(); }}><Server size={17} /> Cambiar servidor Supabase</button></section>
    </div>
  );
}
