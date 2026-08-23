import { BadgeCheck, Dumbbell, ImageOff, Info, Target } from 'lucide-react';
import { Modal } from './Modal';
import { bodyPartLabel, muscleLabel } from '../lib/exercises';
import type { Exercise } from '../types';

type Props = {
  exercise: Exercise;
  onClose: () => void;
};

export function ExerciseDetailModal({ exercise, onClose }: Props) {
  const steps = (exercise.instruction_steps_es ?? []).filter(Boolean);
  const secondary = (exercise.secondary_muscles ?? []).filter(Boolean);

  return (
    <Modal title={exercise.name} onClose={onClose}>
      <article className="exercise-detail">
        <div className="exercise-detail-media">
          {exercise.gif_url ? (
            <img src={exercise.gif_url} alt={`Demostración de ${exercise.name}`} loading="eager" />
          ) : exercise.thumbnail_url ? (
            <img src={exercise.thumbnail_url} alt={exercise.name} loading="eager" />
          ) : (
            <div className="exercise-media-empty"><ImageOff /><span>Sin demostración visual</span></div>
          )}
        </div>

        <div className="exercise-detail-tags">
          {exercise.is_verified && <span className="exercise-badge verified"><BadgeCheck size={14} /> Verificado Bestia</span>}
          {exercise.is_recommended && <span className="exercise-badge recommended">Biblioteca Bestia</span>}
          <span className="exercise-badge"><Target size={14} /> {muscleLabel(exercise.target_muscle) || exercise.primary_muscle}</span>
          <span className="exercise-badge"><Dumbbell size={14} /> {exercise.equipment}</span>
        </div>

        <dl className="exercise-detail-facts">
          <div><dt>Zona</dt><dd>{bodyPartLabel(exercise.body_part)}</dd></div>
          <div><dt>Músculo principal</dt><dd>{exercise.primary_muscle}</dd></div>
          <div><dt>Patrón</dt><dd>{exercise.pattern}</dd></div>
          <div><dt>Equipo</dt><dd>{exercise.equipment}</dd></div>
        </dl>

        {secondary.length > 0 && (
          <section className="exercise-detail-section">
            <h3>Músculos secundarios</h3>
            <div className="exercise-secondary-list">{secondary.map((muscle) => <span key={muscle}>{muscleLabel(muscle)}</span>)}</div>
          </section>
        )}

        {(steps.length > 0 || exercise.instructions_es) && (
          <section className="exercise-detail-section">
            <h3>Cómo hacerlo</h3>
            {steps.length > 0 ? (
              <ol className="exercise-steps">{steps.map((step, index) => <li key={`${index}-${step.slice(0, 20)}`}><span>{index + 1}</span><p>{step}</p></li>)}</ol>
            ) : (
              <p className="exercise-instructions">{exercise.instructions_es}</p>
            )}
          </section>
        )}

        {exercise.media_attribution && (
          <aside className="exercise-attribution"><Info size={14} /><span>{exercise.media_attribution} · Material visual de terceros.</span></aside>
        )}
      </article>
    </Modal>
  );
}
