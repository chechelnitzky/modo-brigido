import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../src/pages/WorkoutSessionPageV2.tsx', import.meta.url);
let source = await readFile(file, 'utf8');

if (source.includes("ExerciseDetailModal") && source.includes("rankExerciseAlternatives")) {
  console.log('Workout exercise-library upgrade already applied.');
  process.exit(0);
}

function replaceRequired(from, to, label) {
  if (!source.includes(from)) throw new Error(`Workout patch failed: ${label}`);
  source = source.replace(from, to);
}

replaceRequired(
  "import { ArrowLeft, BellRing, Check, CheckCircle2, CloudOff, Dumbbell, Pause, Play, RefreshCw, RotateCcw, Save, Search, TimerReset } from 'lucide-react';",
  "import { ArrowLeft, BellRing, Check, CheckCircle2, CloudOff, Dumbbell, Eye, Pause, Play, RefreshCw, RotateCcw, Save, Search, TimerReset } from 'lucide-react';",
  'lucide import'
);

replaceRequired(
  "import { ExerciseCreator } from '../components/ExerciseCreator';\nimport { Modal } from '../components/Modal';",
  "import { ExerciseCreator } from '../components/ExerciseCreator';\nimport { ExerciseDetailModal } from '../components/ExerciseDetailModal';\nimport { Modal } from '../components/Modal';",
  'detail modal import'
);

replaceRequired(
  "import { useOfflineStatus } from '../hooks/useOfflineStatus';\nimport { cacheKeys, cacheSessionSummary, getCached, queueMutation, saveMutation, setCached, syncPendingMutations, updateCachedRoutineExercise } from '../lib/offline';",
  "import { useOfflineStatus } from '../hooks/useOfflineStatus';\nimport { EXERCISE_BASIC_SELECT, EXERCISE_DETAIL_SELECT, matchesExerciseSearch, rankExerciseAlternatives } from '../lib/exercises';\nimport { cacheKeys, cacheSessionSummary, getCached, queueMutation, saveMutation, setCached, syncPendingMutations, updateCachedRoutineExercise } from '../lib/offline';",
  'exercise helpers import'
);

replaceRequired(
  "  const [replaceTarget, setReplaceTarget] = useState<any>(null);\n  const [search, setSearch] = useState('');",
  "  const [replaceTarget, setReplaceTarget] = useState<any>(null);\n  const [search, setSearch] = useState('');\n  const [detailExercise, setDetailExercise] = useState<Exercise | null>(null);",
  'detail state'
);

replaceRequired(
  "exercise:exercise_library(id,slug,name,category,primary_muscle,pattern,equipment,user_id)",
  "exercise:exercise_library(id,slug,name,category,primary_muscle,pattern,equipment,user_id,source,source_exercise_id,source_media_id,body_part,target_muscle,muscle_group,secondary_muscles,instructions_es,instruction_steps_es,thumbnail_url,gif_url,media_attribution,media_license_status,recommendation_rank,is_recommended,is_verified,quality_status)",
  'session exercise relation'
);

replaceRequired(
`  const loadLibrary = async (target: any) => {
    setReplaceTarget(target);
    if (library.length) return;
    const cached = await getCached<Exercise[]>(cacheKeys.exerciseLibrary);
    if (cached) setLibrary(cached);
    if (!navigator.onLine) return;
    const { data } = await supabase
      .from('exercise_library')
      .select('id,slug,name,category,primary_muscle,pattern,equipment,user_id')
      .order('name');
    const next = (data ?? []) as Exercise[];
    setLibrary(next);
    await setCached(cacheKeys.exerciseLibrary, next);
  };

  const filteredLibrary = useMemo(() => {
    const query = search.trim().toLowerCase();
    return library.filter((exercise) => !query || \`${'${exercise.name} ${exercise.primary_muscle} ${exercise.equipment} ${exercise.pattern} ${exercise.category}'}\`.toLowerCase().includes(query));
  }, [library, search]);
`,
`  const loadLibrary = async (target: any) => {
    setReplaceTarget(target);
    setSearch('');
    if (library.length) return;
    const cached = await getCached<Exercise[]>(cacheKeys.exerciseLibrary);
    if (cached?.length) setLibrary(cached);
    if (!navigator.onLine) return;
    const { data } = await supabase
      .from('exercise_library')
      .select(EXERCISE_BASIC_SELECT)
      .order('is_verified', { ascending: false })
      .order('is_recommended', { ascending: false })
      .order('recommendation_rank', { ascending: false })
      .order('name');
    const next = (data ?? []) as Exercise[];
    setLibrary(next);
    await setCached(cacheKeys.exerciseLibrary, next);
  };

  const replacementOptions = useMemo(() => {
    const current = (replaceTarget?.exercise ?? null) as Exercise | null;
    const candidates = library.filter((exercise) => matchesExerciseSearch(exercise, search));
    return rankExerciseAlternatives(current, candidates).slice(0, search.trim() ? 80 : 30);
  }, [library, search, replaceTarget]);
`,
  'library loading and ranking'
);

replaceRequired(
`  const handleReplacementExerciseCreated = (exercise: Exercise) => {
    setLibrary((current) => [...current.filter((item) => item.id !== exercise.id), exercise].sort((a, b) => a.name.localeCompare(b.name, 'es')));
    setSearch(exercise.name);
  };
`,
`  const handleReplacementExerciseCreated = (exercise: Exercise) => {
    setLibrary((current) => [...current.filter((item) => item.id !== exercise.id), exercise].sort((a, b) => a.name.localeCompare(b.name, 'es')));
    setSearch(exercise.name);
  };

  const openExerciseDetail = async (exercise: Exercise | null | undefined) => {
    if (!exercise) return;
    setDetailExercise(exercise);
    const detailKey = \`exercise-detail:${'${exercise.id}'}\`;
    const cached = await getCached<Exercise>(detailKey);
    if (cached) setDetailExercise(cached);
    if (!navigator.onLine) return;
    const { data } = await supabase.from('exercise_library').select(EXERCISE_DETAIL_SELECT).eq('id', exercise.id).single();
    if (data) {
      const detail = data as Exercise;
      setDetailExercise(detail);
      await setCached(detailKey, detail);
    }
  };
`,
  'detail loader'
);

replaceRequired(
  "  const noSearchResults = Boolean(searchedName) && filteredLibrary.length === 0;",
  "  const noSearchResults = Boolean(searchedName) && replacementOptions.length === 0;",
  'empty replacement state'
);

replaceRequired(
`                  <button className={exerciseCompleted ? 'secondary-button compact exercise-toggle active' : 'secondary-button compact exercise-toggle'} onClick={() => toggleExerciseComplete(exercise)}>{exerciseCompleted ? <RotateCcw size={15} /> : <CheckCircle2 size={15} />} {exerciseCompleted ? 'Desmarcar ejercicio' : 'Marcar ejercicio hecho'}</button>
                  <button className="secondary-button compact" onClick={() => loadLibrary(exercise)}><RefreshCw size={15} /> Cambiar</button>`,
`                  <button className={exerciseCompleted ? 'secondary-button compact exercise-toggle active' : 'secondary-button compact exercise-toggle'} onClick={() => toggleExerciseComplete(exercise)}>{exerciseCompleted ? <RotateCcw size={15} /> : <CheckCircle2 size={15} />} {exerciseCompleted ? 'Desmarcar ejercicio' : 'Marcar ejercicio hecho'}</button>
                  {exercise.exercise && <button className="secondary-button compact" onClick={() => void openExerciseDetail(exercise.exercise)}><Eye size={15} /> Cómo hacerlo</button>}
                  <button className="secondary-button compact" onClick={() => loadLibrary(exercise)}><RefreshCw size={15} /> Cambiar</button>`,
  'how-to action'
);

replaceRequired(
`        <p className="muted small">“Solo hoy” modifica esta sesión. “Permanente” cambia la rutina futura.</p>
        {!library.length && !navigator.onLine && <div className="alert error">La biblioteca todavía no está descargada. Ábrela una vez con internet.</div>}
        {noSearchResults && <div className="editor-empty"><Dumbbell /><span>No encontramos “{searchedName}”. Puedes crearlo ahora y después elegir si el cambio es solo por hoy o permanente.</span></div>}
        <ExerciseCreator
          initialName={searchedName}
          buttonLabel={noSearchResults ? \`Agregar “${'${searchedName}'}” como ejercicio nuevo\` : 'Crear ejercicio personalizado'}
          onCreated={handleReplacementExerciseCreated}
        />
        <div className="library-list">{filteredLibrary.map((exercise) => <div className="library-item" key={exercise.id}><div><strong>{exercise.name}</strong><span>{exercise.primary_muscle} · {exercise.equipment}{exercise.user_id ? ' · Personalizado' : ''}</span></div><div><button className="secondary-button compact" onClick={() => replaceExercise(exercise, false)}>Solo hoy</button><button className="primary-button compact" onClick={() => replaceExercise(exercise, true)}><Save size={14} /> Permanente</button></div></div>)}</div>
      </Modal>}
    </div>`,
`        <p className="muted small">“Solo hoy” modifica esta sesión. “Permanente” cambia la rutina futura. Las opciones están ordenadas por músculo objetivo, patrón de movimiento, equipo y calidad.</p>
        {!library.length && !navigator.onLine && <div className="alert error">La biblioteca todavía no está descargada. Ábrela una vez con internet.</div>}
        {noSearchResults && <div className="editor-empty"><Dumbbell /><span>No encontramos “{searchedName}”. Puedes crearlo ahora y después elegir si el cambio es solo por hoy o permanente.</span></div>}
        <ExerciseCreator
          initialName={searchedName}
          buttonLabel={noSearchResults ? \`Agregar “${'${searchedName}'}” como ejercicio nuevo\` : 'Crear ejercicio personalizado'}
          onCreated={handleReplacementExerciseCreated}
        />
        <div className="library-list">{replacementOptions.map(({ exercise, reason }) => <div className="exercise-library-list-item" key={exercise.id}>
          <div className="exercise-library-list-thumb">{exercise.thumbnail_url ? <img src={exercise.thumbnail_url} alt="" loading="lazy" /> : <Dumbbell size={20} />}</div>
          <div className="exercise-library-list-copy"><strong>{exercise.name}</strong><span>{exercise.primary_muscle} · {exercise.equipment}{exercise.user_id ? ' · Personalizado' : exercise.is_recommended ? ' · Recomendado' : ''}</span><span className="exercise-alt-reason">{reason}</span></div>
          <div className="exercise-library-list-actions"><button className="secondary-button compact" onClick={() => void openExerciseDetail(exercise)}><Eye size={14} /> Ver</button><button className="secondary-button compact" onClick={() => replaceExercise(exercise, false)}>Solo hoy</button><button className="primary-button compact" onClick={() => replaceExercise(exercise, true)}><Save size={14} /> Permanente</button></div>
        </div>)}</div>
      </Modal>}
      {detailExercise && <ExerciseDetailModal exercise={detailExercise} onClose={() => setDetailExercise(null)} />}
    </div>`,
  'replacement modal'
);

await writeFile(file, source, 'utf8');
console.log('Applied workout exercise-library upgrade.');
