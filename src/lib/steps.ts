export const STEP_LENGTH_HEIGHT_COEFFICIENT = 0.415;
export const DEFAULT_STEPS_PER_KM = 1417.43;

export type StepConversionSource = 'calibrated' | 'height' | 'default';

export type StepConversion = {
  source: StepConversionSource;
  stepLengthMeters: number;
  stepsPerKm: number;
};

function validPositive(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function getStepConversion(
  heightCm: number | null | undefined,
  calibratedStepsPerKm: number | null | undefined
): StepConversion {
  if (validPositive(calibratedStepsPerKm)) {
    return {
      source: 'calibrated',
      stepsPerKm: calibratedStepsPerKm,
      stepLengthMeters: 1000 / calibratedStepsPerKm
    };
  }

  if (validPositive(heightCm)) {
    const stepLengthMeters = heightCm * STEP_LENGTH_HEIGHT_COEFFICIENT / 100;
    return {
      source: 'height',
      stepLengthMeters,
      stepsPerKm: 1000 / stepLengthMeters
    };
  }

  return {
    source: 'default',
    stepsPerKm: DEFAULT_STEPS_PER_KM,
    stepLengthMeters: 1000 / DEFAULT_STEPS_PER_KM
  };
}

export function stepsToKm(
  steps: number | null | undefined,
  heightCm: number | null | undefined,
  calibratedStepsPerKm: number | null | undefined
): number {
  if (!validPositive(steps)) return 0;
  return steps / getStepConversion(heightCm, calibratedStepsPerKm).stepsPerKm;
}

export function kmToSteps(
  km: number | null | undefined,
  heightCm: number | null | undefined,
  calibratedStepsPerKm: number | null | undefined
): number {
  if (!validPositive(km)) return 0;
  return Math.round(km * getStepConversion(heightCm, calibratedStepsPerKm).stepsPerKm);
}

export function formatKm(value: number): string {
  return value.toLocaleString('es-CL', {
    minimumFractionDigits: value > 0 && value < 0.1 ? 2 : 1,
    maximumFractionDigits: 2
  });
}
