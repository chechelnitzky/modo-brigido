import { Footprints, Lock, RefreshCw, Route } from 'lucide-react';
import { useState } from 'react';
import { DecimalInput } from './DecimalInput';
import { PACER_SYNC_EVENT, syncPacerSteps } from '../lib/pacer';
import { formatKm, getStepConversion, kmToSteps, stepsToKm } from '../lib/steps';

type StepDistanceInputProps = {
  steps: number | null;
  extraSteps: number | null;
  heightCm: number | null;
  calibratedStepsPerKm?: number | null;
  onExtraStepsChange: (steps: number | null) => void;
};

export function StepDistanceInput({
  steps,
  extraSteps,
  heightCm,
  calibratedStepsPerKm,
  onExtraStepsChange
}: StepDistanceInputProps) {
  const [refreshing, setRefreshing] = useState(false);
  const conversion = getStepConversion(heightCm, calibratedStepsPerKm);
  const automaticSteps = Math.max(0, Number(steps) || 0);
  const manualSteps = Math.max(0, Number(extraSteps) || 0);
  const totalSteps = automaticSteps + manualSteps;
  const automaticKm = stepsToKm(automaticSteps, heightCm, calibratedStepsPerKm);
  const manualKm = stepsToKm(manualSteps, heightCm, calibratedStepsPerKm);
  const totalKm = stepsToKm(totalSteps, heightCm, calibratedStepsPerKm);
  const roundedAutomaticKm = Math.round(automaticKm * 100) / 100;
  const roundedManualKm = manualSteps > 0 ? Math.round(manualKm * 100) / 100 : null;
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
          <small>Pacer automático · {sourceLabel}</small>
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

      <div className="step-distance-section-header">
        <strong><Lock size={13} /> Automático</strong>
        <span>Solo lectura</span>
      </div>
      <div className="step-distance-inputs step-distance-inputs-locked">
        <label>
          <span>Pasos</span>
          <input
            type="text"
            value={automaticSteps.toLocaleString('es-CL')}
            readOnly
            aria-label="Pasos automáticos desde Pacer"
          />
        </label>

        <div className="step-distance-link" aria-hidden="true">⇄</div>

        <label>
          <span><Route size={14} /> Kilómetros</span>
          <input
            type="text"
            value={roundedAutomaticKm.toLocaleString('es-CL', { maximumFractionDigits: 2 })}
            readOnly
            aria-label="Kilómetros automáticos estimados"
          />
        </label>
      </div>

      <div className="step-distance-divider" />

      <div className="step-distance-section-header step-distance-extra-header">
        <strong>+ Pasos extra no registrados</strong>
        <span>Opcional</span>
      </div>
      <small className="step-distance-help">Agrégalos solo si no aparecen en Pacer, por ejemplo una caminata en trotadora sin el teléfono.</small>

      <div className="step-distance-inputs step-distance-extra-inputs">
        <label>
          <span>Pasos extra</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]*"
            placeholder="0"
            value={extraSteps ?? ''}
            onChange={(event) => {
              const cleaned = event.target.value.replace(/\D/g, '');
              onExtraStepsChange(cleaned === '' ? null : Number(cleaned));
            }}
          />
        </label>

        <div className="step-distance-link" aria-hidden="true">⇄</div>

        <label>
          <span><Route size={14} /> Km extra</span>
          <DecimalInput
            value={roundedManualKm}
            onValueChange={(value) => onExtraStepsChange(value === null ? null : kmToSteps(Math.max(0, value), heightCm, calibratedStepsPerKm))}
          />
        </label>
      </div>

      <div className="step-distance-total">
        <span>Total del día</span>
        <strong>{totalSteps.toLocaleString('es-CL')} pasos · {formatKm(totalKm)} km</strong>
      </div>

      <small className="step-distance-summary">
        1 paso ≈ {(conversion.stepLengthMeters * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })} cm ·
        1 km ≈ {Math.round(conversion.stepsPerKm).toLocaleString('es-CL')} pasos
      </small>
    </div>
  );
}
