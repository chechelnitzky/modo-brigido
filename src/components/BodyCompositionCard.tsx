import { Activity, Info, Scale } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DailyLog, Profile } from '../types';
import { estimateBodyCompositionForLog, missingBodyFatFields } from '../lib/bodyFat';
import { getBodyFatScale, getBodyFatScaleRange } from '../lib/bodyFatScale';

const COMPACT_RANGE_LABELS: Record<string, string> = {
  Esencial: 'Esen.',
  Fitness: 'Fit.'
};

export function BodyCompositionCard({
  profile,
  log,
  title = 'Composición corporal'
}: {
  profile: Profile;
  log: DailyLog;
  title?: string;
}) {
  const estimate = estimateBodyCompositionForLog(profile, log);
  const missing = missingBodyFatFields(profile, log);
  const scale = profile.sex ? getBodyFatScale(profile.sex) : null;
  const activeRange = profile.sex && estimate
    ? getBodyFatScaleRange(profile.sex, estimate.bodyFatPercentage)
    : null;
  const markerPosition = scale && estimate
    ? Math.max(4, Math.min(96, estimate.bodyFatPercentage / scale.max * 100))
    : 0;

  return (
    <section className="panel bodyfat-panel">
      <div className="section-title">
        <div><p className="eyebrow">MÉTODO U.S. NAVY</p><h2>{title}</h2></div>
        <Activity />
      </div>
      {!estimate || !scale || !activeRange ? (
        <div className="bodyfat-empty">
          <Info />
          <div>
            <strong>Faltan datos para estimar tu grasa corporal</strong>
            <p className="muted">Completa {missing.join(', ')}. La fórmula usa circunferencias y es solo una estimación.</p>
            <Link className="text-link" to="/ajustes">Completar configuración</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="bodyfat-hero">
            <div>
              <span>Grasa corporal estimada</span>
              <strong>{estimate.bodyFatPercentage.toFixed(1)}%</strong>
              <small>{activeRange.label} · {activeRange.description}</small>
            </div>

            <div className="bodyfat-reference">
              <div className="bodyfat-reference-heading">
                <span>Rangos de referencia para {profile.sex === 'female' ? 'mujeres' : 'hombres'}</span>
              </div>

              <div className="bodyfat-scale-chart">
                <div className="bodyfat-scale-marker" style={{ left: `${markerPosition}%` }}>
                  <strong>{estimate.bodyFatPercentage.toFixed(1)}%</strong>
                  <i />
                </div>

                <div className="bodyfat-scale-track" aria-label={`Grasa corporal estimada: ${estimate.bodyFatPercentage.toFixed(1)}%, categoría ${activeRange.label}`}>
                  {scale.ranges.map((range) => (
                    <span
                      key={`${range.min}-${range.max}`}
                      className={`bodyfat-scale-segment ${range.tone}`}
                      style={{ width: `${(range.max - range.min) / scale.max * 100}%` }}
                      title={`${range.label}: ${range.description}`}
                    />
                  ))}
                </div>

                <div className="bodyfat-scale-boundaries" aria-hidden="true">
                  {scale.ranges.slice(0, -1).map((range) => (
                    <span key={range.max} style={{ left: `${range.max / scale.max * 100}%` }}>{range.max}%</span>
                  ))}
                </div>

                <div className="bodyfat-scale-labels">
                  {scale.ranges.slice(1).map((range) => {
                    const left = range.min / scale.max * 100;
                    const width = (range.max - range.min) / scale.max * 100;
                    const useCompactLabel = range.label in COMPACT_RANGE_LABELS;
                    const classes = [
                      'bodyfat-scale-label',
                      range === activeRange ? 'active' : '',
                      useCompactLabel ? 'compact-on-mobile' : ''
                    ].filter(Boolean).join(' ');

                    return (
                      <span
                        key={`${range.label}-${range.min}`}
                        className={classes}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={range.description}
                      >
                        <b className="range-label-full">{range.label}</b>
                        {useCompactLabel && <b className="range-label-compact">{COMPACT_RANGE_LABELS[range.label]}</b>}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="bodyfat-grid">
            <div><span>Masa grasa</span><strong>{estimate.fatMassKg.toFixed(1)} kg</strong></div>
            <div><span>Masa magra</span><strong>{estimate.leanMassKg.toFixed(1)} kg</strong></div>
            <div><span>% grasa ideal Jackson & Pollock</span><strong>{estimate.idealBodyFatPercentage === null ? '—' : `${estimate.idealBodyFatPercentage.toFixed(1)}%`}</strong></div>
            <div><span>Peso ideal Jackson & Pollock</span><strong>{estimate.estimatedTargetWeightKg === null ? '—' : `${estimate.estimatedTargetWeightKg.toFixed(1)} kg`}</strong></div>
            <div><span>Cintura estimada al % ideal</span><strong>{estimate.estimatedTargetWaistCm === null ? '—' : `${estimate.estimatedTargetWaistCm.toFixed(1)} cm`}</strong></div>
          </div>
          {estimate.estimatedWeightToLoseKg !== null && estimate.estimatedWeightToLoseKg > 0 && (
            <div className="bodyfat-target"><Scale size={17} /><span>Brecha estimada al objetivo: <strong>{estimate.estimatedWeightToLoseKg.toFixed(1)} kg</strong></span></div>
          )}
          <p className="bodyfat-disclaimer">Estimación antropométrica, no diagnóstico. Los rangos de la barra son referencias generales diferenciadas por sexo. El peso ideal supone conservar la masa magra; la cintura se despeja desde la fórmula U.S. Navy al porcentaje ideal Jackson & Pollock.</p>
        </>
      )}
    </section>
  );
}
