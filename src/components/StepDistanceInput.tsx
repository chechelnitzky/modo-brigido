import { Footprints, RefreshCw, Route } from 'lucide-react';
import { useState } from 'react';
import { DecimalInput } from './DecimalInput';
import { PACER_SYNC_EVENT, syncPacerSteps } from '../lib/pacer';
import { formatKm, getStepConversion, kmToSteps, stepsToKm } from '../lib/steps';

type StepDistanceInputProps = {
  steps: number | null;
  heightCm: number | null;
  calibratedStepsPerKm?: number | null;
  onStepsChange: (steps: number | null) => void;
};

export function StepDistanceInput({
  steps,
  heightCm,
  calibratedStepsPerKm,
  onStepsChange
}: StepDistanceInputProps) {
  const [refreshing, setRefreshing] = useState(false);
  const conversion = getStepConversion(heightCm, calibratedStepsPerKm);
  const km = steps ? stepsToKm(steps, heightCm, calibratedStepsPerKm) : null;
  const roundedKm = km === null ? null : Math.round(km * 100) / 100;
  const sourceLabel = conversion.source === 'calibrated'
    ? 'Calibración personalizada'
    : conversion.source === 'height'
      ? `Estimado por altura (${heightCm?.toLocaleString('es-CL')} cm × 0,415)`
      : 'Estimación estándar hasta completar tu altura';

  const refreshPacer = async () => {
    if (refreshing || !navigator.onLine) return;
    setRefreshing(true);
    try {
      const result = await syncPacerSteps(2);
      if (result.connected) {
        window.dispatchEvent(new CustomEvent(PACER_SYNC_EVENT, {
          detail: { activities: result.activities ?? [], syncedAt: result.lastSyncAt ?? null }
        }));
      }
    } catch {
      // The automatic/background sync remains available if a manual refresh fails.
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="step-distance-field">
      <div className="step-distance-title">
        <div>
          <span><Footprints size={16} /> Caminata diaria</span>
          <small>{sourceLabel}</small>
        </div>
        <button
          type="button"
          className="icon-button step-refresh-button"
          onClick={() => void refreshPacer()}
          disabled={refreshing || !navigator.onLine}
          aria-label="Actualizar pasos desde Pacer"
          title="Actualizar pasos desde Pacer"
        >
          <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
        </button>
      </div>

      <div className="step-distance-inputs">
        <label>
          <span>Pasos</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]*"
            value={steps ?? ''}
            onChange={(event) => {
              const cleaned = event.target.value.replace(/\D/g, '');
              onStepsChange(cleaned === '' ? null : Number(cleaned));
            }}
          />
        </label>

        <div className="step-distance-link" aria-hidden="true">⇄</div>

        <label>
          <span><Route size={14} /> Kilómetros</span>
          <DecimalInput
            value={roundedKm}
            onValueChange={(value) => onStepsChange(value === null ? null : kmToSteps(value, heightCm, calibratedStepsPerKm))}
          />
        </label>
      </div>

      <small className="step-distance-summary">
        1 paso ≈ {(conversion.stepLengthMeters * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })} cm ·
        1 km ≈ {Math.round(conversion.stepsPerKm).toLocaleString('es-CL')} pasos
        {steps ? ` · ${steps.toLocaleString('es-CL')} pasos = ${formatKm(km ?? 0)} km` : ''}
      </small>
    </div>
  );
}
