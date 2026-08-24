export type KosherCondition = 'Parve' | 'Carne' | 'Lácteo';
export type PrepMode = 'raw-yield' | 'dry-expansion' | 'ready';

export type BuilderFood = {
  id: string;
  name: string;
  condition: KosherCondition;
  caloriesPer100Cooked: number;
  proteinPer100Cooked: number;
  prepMode: PrepMode;
  factor: number;
  prepLabel: string;
  portionStep?: number;
  note?: string;
};

export type MealBuildResult = {
  proteinFood: BuilderFood;
  sideFood: BuilderFood | null;
  proteinCookedG: number;
  sideCookedG: number;
  proteinPrepAmountG: number;
  sidePrepAmountG: number;
  calories: number;
  protein: number;
  calorieTarget: number;
  proteinTarget: number;
};

// Valores de trabajo por 100 g cocidos. Son aproximaciones prácticas basadas en el
// menú actual y tablas estándar; la etiqueta real del producto siempre manda.
export const proteinFoods: BuilderFood[] = [
  { id: 'merluza', name: 'Merluza', condition: 'Parve', caloriesPer100Cooked: 110, proteinPer100Cooked: 21, prepMode: 'raw-yield', factor: 0.75, prepLabel: 'cruda', note: 'Pescado blanco magro.' },
  { id: 'reineta', name: 'Reineta', condition: 'Parve', caloriesPer100Cooked: 110, proteinPer100Cooked: 21, prepMode: 'raw-yield', factor: 0.75, prepLabel: 'cruda', note: 'Usamos la misma base práctica que merluza hasta calibrar tu producto.' },
  { id: 'salmon', name: 'Salmón', condition: 'Parve', caloriesPer100Cooked: 207, proteinPer100Cooked: 22, prepMode: 'raw-yield', factor: 0.78, prepLabel: 'crudo' },
  { id: 'atun', name: 'Atún al agua', condition: 'Parve', caloriesPer100Cooked: 111, proteinPer100Cooked: 22.2, prepMode: 'ready', factor: 1, prepLabel: 'drenado', note: 'Se pesa drenado; no necesita conversión.' },
  { id: 'jurel', name: 'Jurel ahumado', condition: 'Parve', caloriesPer100Cooked: 220, proteinPer100Cooked: 26.5, prepMode: 'ready', factor: 1, prepLabel: 'del envase', note: 'Usar la etiqueta del producto cuando cambie la marca.' },
  { id: 'pavo', name: 'Pavo molido', condition: 'Carne', caloriesPer100Cooked: 229, proteinPer100Cooked: 28.6, prepMode: 'raw-yield', factor: 0.70, prepLabel: 'crudo' },
  { id: 'vacuno', name: 'Vacuno molido magro', condition: 'Carne', caloriesPer100Cooked: 250, proteinPer100Cooked: 26, prepMode: 'raw-yield', factor: 0.75, prepLabel: 'crudo', note: 'Ajustar cuando tengamos la etiqueta/% de grasa exacto.' },
  { id: 'osobuco', name: 'Osobuco / vacuno de olla', condition: 'Carne', caloriesPer100Cooked: 217, proteinPer100Cooked: 26.1, prepMode: 'raw-yield', factor: 0.61, prepLabel: 'crudo sin hueso equivalente', note: 'El rendimiento real cambia bastante por hueso y grasa.' },
  { id: 'huevo', name: 'Huevos', condition: 'Parve', caloriesPer100Cooked: 144, proteinPer100Cooked: 12.6, prepMode: 'ready', factor: 1, prepLabel: 'comestibles', portionStep: 50, note: '50 g ≈ 1 huevo grande; la tarjeta redondea a huevos completos.' },
  { id: 'queso', name: 'Queso mantecoso kosher', condition: 'Lácteo', caloriesPer100Cooked: 367, proteinPer100Cooked: 23.3, prepMode: 'ready', factor: 1, prepLabel: 'tal cual', portionStep: 10 },
  { id: 'lentejas', name: 'Lentejas', condition: 'Parve', caloriesPer100Cooked: 115, proteinPer100Cooked: 9, prepMode: 'dry-expansion', factor: 2.4, prepLabel: 'secas', note: 'Puede ser proteína base vegetariana o acompañamiento.' },
  { id: 'garbanzos', name: 'Garbanzos', condition: 'Parve', caloriesPer100Cooked: 164, proteinPer100Cooked: 8.9, prepMode: 'dry-expansion', factor: 2.4, prepLabel: 'secos', note: 'Puede ser proteína base vegetariana o acompañamiento.' },
  { id: 'porotos', name: 'Porotos', condition: 'Parve', caloriesPer100Cooked: 127, proteinPer100Cooked: 8.7, prepMode: 'dry-expansion', factor: 2.4, prepLabel: 'secos', note: 'Puede ser proteína base vegetariana o acompañamiento.' },
  { id: 'edamame', name: 'Edamame', condition: 'Parve', caloriesPer100Cooked: 121, proteinPer100Cooked: 11.9, prepMode: 'ready', factor: 1, prepLabel: 'preparado', note: 'Legumbre de soya; suficientemente proteica para usarla como base.' },
  { id: 'habas', name: 'Habas', condition: 'Parve', caloriesPer100Cooked: 110, proteinPer100Cooked: 7.6, prepMode: 'ready', factor: 1, prepLabel: 'cocidas', note: 'Legumbre; puede ser base vegetariana o acompañamiento.' }
];

export const sideFoods: BuilderFood[] = [
  { id: 'none', name: 'Sin acompañamiento', condition: 'Parve', caloriesPer100Cooked: 0, proteinPer100Cooked: 0, prepMode: 'ready', factor: 1, prepLabel: '—' },
  { id: 'arroz', name: 'Arroz', condition: 'Parve', caloriesPer100Cooked: 130, proteinPer100Cooked: 2.7, prepMode: 'dry-expansion', factor: 3.0, prepLabel: 'seco' },
  { id: 'quinoa', name: 'Quinoa', condition: 'Parve', caloriesPer100Cooked: 120, proteinPer100Cooked: 4.4, prepMode: 'dry-expansion', factor: 2.5, prepLabel: 'seca' },
  { id: 'papa', name: 'Papa', condition: 'Parve', caloriesPer100Cooked: 76, proteinPer100Cooked: 2, prepMode: 'raw-yield', factor: 0.90, prepLabel: 'cruda' },
  { id: 'pasta', name: 'Pasta / fideos', condition: 'Parve', caloriesPer100Cooked: 159, proteinPer100Cooked: 5.3, prepMode: 'dry-expansion', factor: 2.55, prepLabel: 'seca' },
  { id: 'lentejas', name: 'Lentejas', condition: 'Parve', caloriesPer100Cooked: 115, proteinPer100Cooked: 9, prepMode: 'dry-expansion', factor: 2.4, prepLabel: 'secas' },
  { id: 'garbanzos', name: 'Garbanzos', condition: 'Parve', caloriesPer100Cooked: 164, proteinPer100Cooked: 8.9, prepMode: 'dry-expansion', factor: 2.4, prepLabel: 'secos' },
  { id: 'porotos', name: 'Porotos', condition: 'Parve', caloriesPer100Cooked: 127, proteinPer100Cooked: 8.7, prepMode: 'dry-expansion', factor: 2.4, prepLabel: 'secos' },
  { id: 'edamame', name: 'Edamame', condition: 'Parve', caloriesPer100Cooked: 121, proteinPer100Cooked: 11.9, prepMode: 'ready', factor: 1, prepLabel: 'preparado' },
  { id: 'habas', name: 'Habas', condition: 'Parve', caloriesPer100Cooked: 110, proteinPer100Cooked: 7.6, prepMode: 'ready', factor: 1, prepLabel: 'cocidas' },
  { id: 'cebada', name: 'Cebada', condition: 'Parve', caloriesPer100Cooked: 123, proteinPer100Cooked: 2.3, prepMode: 'dry-expansion', factor: 3.0, prepLabel: 'seca' }
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundToStep(value: number, step: number) {
  return Math.round(value / step) * step;
}

function prepAmount(food: BuilderFood, cookedG: number) {
  if (!cookedG) return 0;
  if (food.prepMode === 'raw-yield') return cookedG / food.factor;
  if (food.prepMode === 'dry-expansion') return cookedG / food.factor;
  return cookedG;
}

export function suggestedMealTargets(kind: 'Almuerzo' | 'Cena', caloriesRemaining: number, proteinRemaining: number) {
  if (kind === 'Almuerzo') {
    const calories = clamp(Math.round(caloriesRemaining * 0.42), 380, Math.min(550, Math.max(380, caloriesRemaining - 450)));
    const protein = clamp(Math.round(proteinRemaining * 0.48), 35, Math.min(52, Math.max(35, proteinRemaining - 35)));
    return { calories, protein };
  }
  return {
    calories: clamp(Math.min(caloriesRemaining, 620), 320, 620),
    protein: clamp(Math.min(proteinRemaining, 60), 30, 60)
  };
}

export function buildMealPlan(proteinId: string, sideId: string, calorieTarget: number, proteinTarget: number): MealBuildResult | null {
  const proteinFood = proteinFoods.find((item) => item.id === proteinId);
  const selectedSide = sideFoods.find((item) => item.id === sideId) ?? sideFoods[0];
  if (!proteinFood || !selectedSide) return null;
  const sideFood = selectedSide.id === 'none' ? null : selectedSide;

  let best: { score: number; proteinG: number; sideG: number; calories: number; protein: number } | null = null;
  const proteinStep = proteinFood.portionStep ?? 5;
  const sideStep = 5;
  const proteinMin = proteinFood.id === 'queso' ? 30 : proteinFood.id === 'huevo' ? 100 : 80;
  const proteinMax = ['lentejas', 'garbanzos', 'porotos', 'edamame', 'habas'].includes(proteinFood.id) ? 400 : proteinFood.id === 'queso' ? 180 : 350;
  const sideMax = sideFood ? 350 : 0;

  for (let proteinG = proteinMin; proteinG <= proteinMax; proteinG += proteinStep) {
    for (let sideG = 0; sideG <= sideMax; sideG += sideStep) {
      const proteinCalories = proteinG * proteinFood.caloriesPer100Cooked / 100;
      const proteinProtein = proteinG * proteinFood.proteinPer100Cooked / 100;
      const sideCalories = sideFood ? sideG * sideFood.caloriesPer100Cooked / 100 : 0;
      const sideProtein = sideFood ? sideG * sideFood.proteinPer100Cooked / 100 : 0;
      const calories = proteinCalories + sideCalories;
      const protein = proteinProtein + sideProtein;
      if (calories > calorieTarget * 1.10) continue;

      const calorieError = Math.abs(calories - calorieTarget) / Math.max(1, calorieTarget);
      const proteinShortfall = Math.max(0, proteinTarget - protein) / Math.max(1, proteinTarget);
      const proteinExcess = Math.max(0, protein - proteinTarget) / Math.max(1, proteinTarget);
      const tinySidePenalty = sideFood && sideG > 0 && sideG < 60 ? 0.08 : 0;
      const score = calorieError * 1.15 + proteinShortfall * 2.8 + proteinExcess * 0.22 + tinySidePenalty;
      if (!best || score < best.score) best = { score, proteinG, sideG, calories, protein };
    }
  }

  if (!best) return null;
  const proteinCookedG = roundToStep(best.proteinG, proteinFood.portionStep ?? 5);
  const sideCookedG = sideFood ? roundToStep(best.sideG, 5) : 0;
  return {
    proteinFood,
    sideFood,
    proteinCookedG,
    sideCookedG,
    proteinPrepAmountG: Math.round(prepAmount(proteinFood, proteinCookedG)),
    sidePrepAmountG: sideFood ? Math.round(prepAmount(sideFood, sideCookedG)) : 0,
    calories: Math.round(best.calories),
    protein: Math.round(best.protein * 10) / 10,
    calorieTarget,
    proteinTarget
  };
}
