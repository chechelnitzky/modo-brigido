import { PlusCircle, Save, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { cacheKeys, getCached, setCached } from '../lib/offline';
import { getSupabase } from '../lib/supabase';
import type { Exercise } from '../types';

const CATEGORY_OPTIONS = [
  { value: 'push', label: 'Empuje / Push' },
  { value: 'pull', label: 'Tirón / Pull' },
  { value: 'legs', label: 'Piernas y glúteos' },
  { value: 'core', label: 'Core y abdominales' },
  { value: 'full_body', label: 'Full body' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'mobility', label: 'Movilidad' },
  { value: 'other', label: 'Otro' }
];

const EMPTY_FORM = {
  name: '',
  category: 'legs',
  primary_muscle: '',
  pattern: '',
  equipment: 'Máquina'
};

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

type ExerciseCreatorProps = {
  onCreated: (exercise: Exercise) => void;
  initialName?: string;
  buttonLabel?: string;
};

export function ExerciseCreator({ onCreated, initialName = '', buttonLabel = 'Crear ejercicio personalizado' }: ExerciseCreatorProps) {
  const supabase = getSupabase();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const openCreator = () => {
    setForm({ ...EMPTY_FORM, name: initialName.trim() });
    setError('');
    setOpen(true);
  };

  const createExercise = async () => {
    if (!user) return;
    if (!navigator.onLine) {
      setError('Conéctate a internet para crear el ejercicio por primera vez. Después quedará disponible offline.');
      return;
    }
    const name = form.name.trim();
    const primaryMuscle = form.primary_muscle.trim();
    const pattern = form.pattern.trim();
    const equipment = form.equipment.trim();
    if (!name || !primaryMuscle || !pattern || !equipment) {
      setError('Completa nombre, músculo principal, patrón de movimiento y equipo.');
      return;
    }

    setSaving(true);
    setError('');
    const slug = `custom-${user.id.slice(0, 8)}-${slugify(name) || 'ejercicio'}-${crypto.randomUUID().slice(0, 8)}`;
    const { data, error: insertError } = await supabase
      .from('exercise_library')
      .insert({
        user_id: user.id,
        slug,
        name,
        category: form.category,
        primary_muscle: primaryMuscle,
        pattern,
        equipment
      })
      .select('id,slug,name,category,primary_muscle,pattern,equipment,user_id')
      .single();

    if (insertError || !data) {
      setError(insertError?.message || 'No se pudo crear el ejercicio.');
      setSaving(false);
      return;
    }

    const created = data as Exercise;
    const cached = (await getCached<Exercise[]>(cacheKeys.exerciseLibrary)) ?? [];
    await setCached(
      cacheKeys.exerciseLibrary,
      [...cached.filter((item) => item.id !== created.id), created].sort((a, b) => a.name.localeCompare(b.name, 'es'))
    );
    onCreated(created);
    setForm(EMPTY_FORM);
    setOpen(false);
    setSaving(false);
  };

  if (!open) {
    return <button type="button" className="secondary-button custom-exercise-open" onClick={openCreator}><PlusCircle size={17} /> {buttonLabel}</button>;
  }

  return (
    <section className="custom-exercise-creator">
      <div className="custom-exercise-heading">
        <div><strong>Nuevo ejercicio personalizado</strong><span>Completa las categorías para encontrarlo fácilmente después.</span></div>
        <button type="button" className="icon-button" onClick={() => { setOpen(false); setError(''); }}><X size={17} /></button>
      </div>
      <div className="custom-exercise-grid">
        <label>Nombre<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Patada de glúteos en máquina" /></label>
        <label>Categoría<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label>Músculo principal<input value={form.primary_muscle} onChange={(event) => setForm({ ...form, primary_muscle: event.target.value })} placeholder="Glúteos" /></label>
        <label>Patrón de movimiento<input value={form.pattern} onChange={(event) => setForm({ ...form, pattern: event.target.value })} placeholder="Extensión de cadera" /></label>
        <label>Equipo<input value={form.equipment} onChange={(event) => setForm({ ...form, equipment: event.target.value })} placeholder="Máquina, polea, mancuernas…" /></label>
      </div>
      {error && <div className="alert error">{error}</div>}
      <button type="button" className="primary-button" onClick={createExercise} disabled={saving}><Save size={17} /> {saving ? 'Creando…' : 'Guardar ejercicio'}</button>
    </section>
  );
}
