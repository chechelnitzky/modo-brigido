import { BookOpen, ChevronRight, Dumbbell, Search, Sparkles, Target } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ExerciseDetailModal } from '../components/ExerciseDetailModal';
import { useAuth } from '../context/AuthContext';
import { cacheKeys, getCached, setCached } from '../lib/offline';
import { bodyGroupMatches, bodyPartLabel, EXERCISE_BASIC_SELECT, EXERCISE_DETAIL_SELECT, matchesExerciseSearch } from '../lib/exercises';
import { getSupabase } from '../lib/supabase';
import type { Exercise } from '../types';

const BODY_GROUPS = [
  { value: 'all', label: 'Todo' },
  { value: 'chest', label: 'Pecho' },
  { value: 'back', label: 'Espalda' },
  { value: 'shoulders', label: 'Hombros' },
  { value: 'arms', label: 'Brazos' },
  { value: 'legs', label: 'Piernas' },
  { value: 'waist', label: 'Core' },
  { value: 'cardio', label: 'Cardio' }
];

const PAGE_SIZE = 48;

export function ExerciseLibraryPage() {
  const supabase = getSupabase();
  const { user } = useAuth();
  const [library, setLibrary] = useState<Exercise[]>([]);
  const [query, setQuery] = useState('');
  const [bodyGroup, setBodyGroup] = useState('all');
  const [equipment, setEquipment] = useState('all');
  const [muscle, setMuscle] = useState('all');
  const [bestiaOnly, setBestiaOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const cached = await getCached<Exercise[]>(cacheKeys.exerciseLibrary);
      if (!cancelled && cached?.length) {
        setLibrary(cached.filter((item) => !item.user_id || item.user_id === user.id));
        setLoading(false);
      }
      if (!navigator.onLine) {
        if (!cached?.length) setError('Conéctate una vez a internet para descargar la biblioteca de ejercicios.');
        setLoading(false);
        return;
      }

      const BATCH_SIZE = 1000;
      const next: Exercise[] = [];
      let from = 0;
      let loadError: { message: string } | null = null;

      while (true) {
        const { data, error } = await supabase
          .from('exercise_library')
          .select(EXERCISE_BASIC_SELECT)
          .order('is_verified', { ascending: false })
          .order('is_recommended', { ascending: false })
          .order('recommendation_rank', { ascending: false })
          .order('name')
          .range(from, from + BATCH_SIZE - 1);

        if (error) {
          loadError = error;
          break;
        }

        const batch = (data ?? []) as Exercise[];
        next.push(...batch);
        if (batch.length < BATCH_SIZE) break;
        from += BATCH_SIZE;
      }

      if (cancelled) return;
      if (loadError) {
        setError(loadError.message);
        setLoading(false);
        return;
      }
      setLibrary(next);
      await setCached(cacheKeys.exerciseLibrary, next);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [supabase, user]);

  useEffect(() => { setLimit(PAGE_SIZE); }, [query, bodyGroup, equipment, muscle, bestiaOnly]);

  const equipmentOptions = useMemo(() => [...new Set(library.map((item) => item.equipment).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [library]);
  const muscleOptions = useMemo(() => [...new Set(library.map((item) => item.primary_muscle).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [library]);

  const filtered = useMemo(() => library.filter((exercise) => {
    if (!matchesExerciseSearch(exercise, query)) return false;
    if (!bodyGroupMatches(exercise, bodyGroup)) return false;
    if (equipment !== 'all' && exercise.equipment !== equipment) return false;
    if (muscle !== 'all' && exercise.primary_muscle !== muscle) return false;
    if (bestiaOnly && !exercise.is_recommended) return false;
    return true;
  }), [library, query, bodyGroup, equipment, muscle, bestiaOnly]);

  const openExercise = async (exercise: Exercise) => {
    const detailKey = `exercise-detail:${exercise.id}`;
    const cached = await getCached<Exercise>(detailKey);
    if (cached) setSelected(cached);
    else setSelected(exercise);
    if (!navigator.onLine) return;
    const { data } = await supabase.from('exercise_library').select(EXERCISE_DETAIL_SELECT).eq('id', exercise.id).single();
    if (data) {
      const detail = data as Exercise;
      setSelected(detail);
      await setCached(detailKey, detail);
    }
  };

  const recommendedCount = library.filter((item) => item.is_recommended).length;

  if (loading) return <div className="page-loading">Cargando biblioteca de ejercicios…</div>;

  return (
    <div className="exercise-library-page">
      <section className="exercise-library-hero panel">
        <div>
          <p className="eyebrow">BIBLIOTECA DE EJERCICIOS</p>
          <h1>Aprende cada movimiento</h1>
          <p className="muted">Explora la biblioteca completa, filtra por músculo o equipo y abre cada ejercicio para ver su GIF y ejecución paso a paso.</p>
        </div>
        <div className="exercise-library-stat"><BookOpen /><strong>{library.length.toLocaleString('es-CL')}</strong><span>ejercicios disponibles</span></div>
      </section>

      {error && <div className="alert error">{error}</div>}

      <section className="exercise-library-controls panel">
        <div className="search-box exercise-library-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar press, bíceps, espalda, polea…" /></div>
        <div className="exercise-body-chips">
          {BODY_GROUPS.map((group) => <button key={group.value} className={bodyGroup === group.value ? 'exercise-filter-chip active' : 'exercise-filter-chip'} onClick={() => setBodyGroup(group.value)}>{group.label}</button>)}
        </div>
        <div className="exercise-filter-row">
          <label>Equipo<select value={equipment} onChange={(event) => setEquipment(event.target.value)}><option value="all">Todos</option>{equipmentOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>Músculo<select value={muscle} onChange={(event) => setMuscle(event.target.value)}><option value="all">Todos</option>{muscleOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <button className={bestiaOnly ? 'bestia-toggle active' : 'bestia-toggle'} onClick={() => setBestiaOnly((current) => !current)}><Sparkles size={16} /><span>Selección Bestia</span><strong>{recommendedCount}</strong></button>
        </div>
      </section>

      <div className="exercise-library-results"><strong>{filtered.length.toLocaleString('es-CL')} resultados</strong><span>{bodyGroup === 'all' ? 'Todo el cuerpo' : BODY_GROUPS.find((item) => item.value === bodyGroup)?.label}</span></div>

      <section className="exercise-card-grid">
        {filtered.slice(0, limit).map((exercise) => (
          <button className="exercise-library-card" key={exercise.id} onClick={() => void openExercise(exercise)}>
            <div className="exercise-library-thumb">
              {exercise.thumbnail_url ? <img src={exercise.thumbnail_url} alt="" loading="lazy" /> : <Dumbbell />}
              {exercise.is_verified && <span className="exercise-card-verified">BESTIA</span>}
            </div>
            <div className="exercise-library-card-body">
              <div className="exercise-card-heading"><strong>{exercise.name}</strong><ChevronRight size={18} /></div>
              <span className="exercise-card-muscle"><Target size={14} /> {exercise.primary_muscle}</span>
              <div className="exercise-card-meta"><span>{bodyPartLabel(exercise.body_part)}</span><span>{exercise.equipment}</span></div>
              <small>{exercise.pattern}</small>
            </div>
          </button>
        ))}
      </section>

      {!filtered.length && <div className="editor-empty"><Search /><span>No encontramos ejercicios con esos filtros.</span></div>}
      {limit < filtered.length && <button className="secondary-button exercise-load-more" onClick={() => setLimit((current) => current + PAGE_SIZE)}>Ver más ejercicios</button>}

      {selected && <ExerciseDetailModal exercise={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
