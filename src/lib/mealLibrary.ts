export type MealCategory = 'Desayuno' | 'Almuerzo' | 'Snack' | 'Cena';
export type MealCondition = 'Lácteo' | 'Parve' | 'Carne';

export type MealOption = {
  code: string;
  category: MealCategory;
  name: string;
  details: string;
  condition: MealCondition;
  protein: number;
  calories: number;
  note?: string;
};

export const MEAL_CALORIE_TARGET = 1800;

export const mealCategories: MealCategory[] = ['Desayuno', 'Almuerzo', 'Snack', 'Cena'];

export const mealLibrary: MealOption[] = [
  { code: 'B1', category: 'Desayuno', name: 'Shake con leche + 2 huevos', details: '1 scoop NUTRABIO Classic Whey Chocolate Milkshake (34,17 g) + 300 ml de leche Soprole semidescremada + 2 huevos.', condition: 'Lácteo', protein: 47.2, calories: 412, note: 'Shake fijo: 268 kcal y 34,6 g de proteína.' },
  { code: 'B2', category: 'Desayuno', name: 'Shake con leche + yogur', details: '1 scoop NUTRABIO + 300 ml de leche Soprole semidescremada + 1 yogur Protein+ de 155 g.', condition: 'Lácteo', protein: 44.6, calories: 368, note: 'Máximo 1 yogur de 155 g.' },
  { code: 'B3', category: 'Desayuno', name: 'Shake con leche + huevo + pan', details: '1 scoop NUTRABIO + 300 ml de leche Soprole semidescremada + 1 huevo + 1 rebanada de pan de molde kosher.', condition: 'Lácteo', protein: 43.9, calories: 415 },
  { code: 'B4', category: 'Desayuno', name: 'Shake con leche + pita', details: '1 scoop NUTRABIO + 300 ml de leche Soprole semidescremada + 1 pita kosher.', condition: 'Lácteo', protein: 39.6, calories: 398, note: 'Revisar condición láctea/parve de la pita.' },
  { code: 'B5', category: 'Desayuno', name: 'Shake con leche + 1/2 marraqueta', details: '1 scoop NUTRABIO + 300 ml de leche Soprole semidescremada + 1/2 marraqueta kosher (aprox. 50 g).', condition: 'Lácteo', protein: 38.6, calories: 403 },
  { code: 'B6', category: 'Desayuno', name: 'Shake con leche + yogur + fruta', details: '1 scoop NUTRABIO + 300 ml de leche Soprole semidescremada + 1 yogur Protein+ de 155 g + 1 fruta mediana.', condition: 'Lácteo', protein: 45.6, calories: 458 },
  { code: 'B7', category: 'Desayuno', name: 'Yogur + whey + fruta', details: '1 yogur Protein+ de 155 g + 1 scoop NUTRABIO con agua + 1 fruta.', condition: 'Lácteo', protein: 36, calories: 320, note: 'El scoop con agua aporta 130 kcal y 25 g de proteína.' },
  { code: 'B8', category: 'Desayuno', name: 'Atún + 2 huevos + pita', details: '1 lata de atún (90 g drenados) + 2 huevos + 1 pita kosher + tomate.', condition: 'Parve', protein: 37.6, calories: 374, note: 'Usar pita parve.' },
  { code: 'B9', category: 'Desayuno', name: 'Atún + 2 huevos + marraqueta', details: '1 lata de atún (90 g drenados) + 2 huevos + 1/2 marraqueta kosher + tomate.', condition: 'Parve', protein: 36.6, calories: 379 },
  { code: 'B10', category: 'Desayuno', name: 'Yogur + 2 huevos + pita', details: '1 yogur Protein+ de 155 g + 2 huevos + 1 pita kosher.', condition: 'Lácteo', protein: 27.6, calories: 374 },

  { code: 'L1', category: 'Almuerzo', name: 'Atún con arroz', details: '2 latas de atún (180 g drenados) + 120 g de arroz cocido + ensalada grande + 1 cucharadita (5 g) de aceite.', condition: 'Parve', protein: 45.2, calories: 461, note: 'Aceite medido: 5 g.' },
  { code: 'L2', category: 'Almuerzo', name: 'Atún con lentejas', details: '1 lata de atún (90 g drenados) + 200 g de lentejas cocidas + 80 g de arroz cocido + ensalada.', condition: 'Parve', protein: 42.2, calories: 484, note: 'No agregar mayonesa sin medir.' },
  { code: 'L3', category: 'Almuerzo', name: 'Jurel ahumado con papas', details: '120 g de jurel ahumado + 200 g de papas + ensalada de repollo y pepino.', condition: 'Parve', protein: 35.8, calories: 466, note: 'Sin aceite adicional.' },
  { code: 'L4', category: 'Almuerzo', name: 'Jurel, huevo y arroz', details: '100 g de jurel ahumado + 1 huevo + 100 g de arroz cocido + ensalada.', condition: 'Parve', protein: 37.5, calories: 472, note: 'Sin aceite adicional.' },
  { code: 'L5', category: 'Almuerzo', name: 'Merluza o reineta con papas', details: '200 g de pescado cocido + 200 g de papas + ensalada + 1 cucharadita (5 g) de aceite.', condition: 'Parve', protein: 48, calories: 467, note: 'Pescado y papas: peso cocido.' },
  { code: 'L6', category: 'Almuerzo', name: 'Salmón con arroz', details: '150 g de salmón cocido + 100 g de arroz cocido + ensalada verde.', condition: 'Parve', protein: 37.7, calories: 490, note: 'Sin aceite adicional.' },
  { code: 'L7', category: 'Almuerzo', name: 'Atún con garbanzos y pita', details: '1 lata de atún (90 g drenados) + 120 g de garbanzos cocidos + 1 pita kosher + ensalada.', condition: 'Parve', protein: 37.7, calories: 477, note: 'Usar pita parve.' },
  { code: 'L8', category: 'Almuerzo', name: 'Lentejas con huevos', details: '200 g de lentejas + 2 huevos + 80 g de arroz cocido + ensalada.', condition: 'Parve', protein: 34.8, calories: 528, note: 'Opción sin pescado.' },
  { code: 'L9', category: 'Almuerzo', name: 'Pasta con atún', details: '2 latas de atún (180 g drenados) + 140 g de pasta cocida + salsa de tomate + ensalada.', condition: 'Parve', protein: 49.4, calories: 473, note: 'Pasta: peso cocido.' },
  { code: 'L10', category: 'Almuerzo', name: 'Almuerzo liviano de viernes', details: '1 lata de atún (90 g drenados) + 2 huevos + 150 g de papas + ensalada.', condition: 'Parve', protein: 37.6, calories: 408, note: 'Pensado para dejar más margen a la cena.' },
  { code: 'L11', category: 'Almuerzo', name: 'Merluza con arroz', details: '200 g de merluza o reineta + 100 g de arroz cocido + ensalada + 1 cucharadita (5 g) de aceite.', condition: 'Parve', protein: 46.7, calories: 445, note: 'Muy buena relación proteína/calorías.' },
  { code: 'L12', category: 'Almuerzo', name: 'Salmón con papas', details: '120 g de salmón + 150 g de papas + ensalada grande.', condition: 'Parve', protein: 31.4, calories: 412, note: 'Sin aceite adicional.' },
  { code: 'L13', category: 'Almuerzo', name: 'Atún con papas', details: '2 latas de atún (180 g drenados) + 200 g de papas + ensalada.', condition: 'Parve', protein: 46, calories: 402, note: 'Muy alto en proteína y bajo en calorías.' },
  { code: 'L14', category: 'Almuerzo', name: 'Jurel con lentejas', details: '100 g de jurel + 150 g de lentejas + ensalada.', condition: 'Parve', protein: 42, calories: 443, note: 'Sin aceite adicional.' },
  { code: 'L15', category: 'Almuerzo', name: 'Merluza con lentejas', details: '200 g de merluza o reineta + 120 g de lentejas + ensalada.', condition: 'Parve', protein: 54.8, calories: 408, note: 'De las opciones más proteicas.' },
  { code: 'L16', category: 'Almuerzo', name: 'Salmón con garbanzos', details: '150 g de salmón + 100 g de garbanzos + ensalada.', condition: 'Parve', protein: 43.9, calories: 524, note: 'Sin aceite adicional.' },

  { code: 'S1', category: 'Snack', name: 'Yogur Protein+', details: '1 yogur Protein+ de 155 g.', condition: 'Lácteo', protein: 10, calories: 100 },
  { code: 'S2', category: 'Snack', name: 'Yogur + fruta', details: '1 yogur Protein+ de 155 g + 1 fruta.', condition: 'Lácteo', protein: 11, calories: 190 },
  { code: 'S3', category: 'Snack', name: '2 huevos', details: '2 huevos duros o revueltos.', condition: 'Parve', protein: 12.6, calories: 144, note: 'Sin aceite o con spray medido.' },
  { code: 'S4', category: 'Snack', name: 'Atún solo', details: '1 lata de atún (90 g drenados) + limón y pimienta.', condition: 'Parve', protein: 20, calories: 100, note: 'Excelente proteína por caloría.' },
  { code: 'S5', category: 'Snack', name: 'Whey con agua', details: '1 scoop NUTRABIO Classic Whey Chocolate Milkshake con agua.', condition: 'Lácteo', protein: 25, calories: 130, note: '1 scoop: 130 kcal y 25 g de proteína.' },
  { code: 'S6', category: 'Snack', name: 'Yogur + frutos secos', details: '1 yogur Protein+ de 155 g + 15 g de nueces o almendras.', condition: 'Lácteo', protein: 13, calories: 190, note: 'Pesar los frutos secos.' },
  { code: 'S7', category: 'Snack', name: 'Atún + huevo', details: '1 lata de atún (90 g drenados) + 1 huevo.', condition: 'Parve', protein: 26.3, calories: 172 },
  { code: 'S8', category: 'Snack', name: 'Pita con queso', details: '1 pita kosher + 30 g de queso mantecoso con hejsher.', condition: 'Lácteo', protein: 12, calories: 240 },
  { code: 'S9', category: 'Snack', name: 'Yogur + pan', details: '1 yogur Protein+ de 155 g + 1 rebanada de pan de molde kosher.', condition: 'Lácteo', protein: 13, calories: 175 },
  { code: 'S10', category: 'Snack', name: 'Yogur + 1/2 scoop whey', details: '1 yogur Protein+ de 155 g + 1/2 scoop de NUTRABIO.', condition: 'Lácteo', protein: 22.5, calories: 165, note: '1/2 scoop: 65 kcal y 12,5 g de proteína.' },

  { code: 'D1', category: 'Cena', name: 'Merluza/reineta + verduras', details: '200 g de pescado + verduras asadas o salteadas + 1 cucharadita (5 g) de aceite.', condition: 'Parve', protein: 44, calories: 315, note: 'Cena muy magra.' },
  { code: 'D2', category: 'Cena', name: 'Merluza/reineta + papas', details: '200 g de pescado + 150 g de papas + ensalada grande.', condition: 'Parve', protein: 47, calories: 384, note: 'Sin aceite o con spray medido.' },
  { code: 'D3', category: 'Cena', name: 'Salmón + verduras', details: '150 g de salmón + verduras al horno o ensalada grande.', condition: 'Parve', protein: 35, calories: 360, note: 'No agregar aceite.' },
  { code: 'D4', category: 'Cena', name: 'Salmón + papas', details: '120 g de salmón + 150 g de papas + ensalada.', condition: 'Parve', protein: 31.4, calories: 412, note: 'No agregar aceite.' },
  { code: 'D5', category: 'Cena', name: 'Atún con palta y ensalada', details: '2 latas de atún (180 g drenados) + 50 g de palta + ensalada grande.', condition: 'Parve', protein: 43, calories: 330, note: 'Sin aceite adicional.' },
  { code: 'D6', category: 'Cena', name: 'Atún + 2 huevos + ensalada', details: '1 lata de atún (90 g drenados) + 2 huevos + ensalada.', condition: 'Parve', protein: 34.6, calories: 294 },
  { code: 'D7', category: 'Cena', name: 'Jurel ahumado + ensalada', details: '120 g de jurel ahumado + ensalada grande de tomate, pepino y repollo.', condition: 'Parve', protein: 34, calories: 314, note: 'Sin aceite adicional.' },
  { code: 'D8', category: 'Cena', name: 'Jurel + huevo + ensalada', details: '100 g de jurel + 1 huevo + ensalada grande.', condition: 'Parve', protein: 34.8, calories: 342, note: 'Sin aceite adicional.' },
  { code: 'D9', category: 'Cena', name: 'Hamburguesas de pavo + verduras', details: '200 g de pavo molido crudo + verduras + 1 cucharadita (5 g) de aceite.', condition: 'Carne', protein: 42, calories: 445, note: 'No combinar con lácteos.' },
  { code: 'D10', category: 'Cena', name: 'Pavo con lentejas', details: '180 g de pavo molido crudo + 100 g de lentejas + tomate, cebolla y zapallito.', condition: 'Carne', protein: 47, calories: 453 },
  { code: 'D11', category: 'Cena', name: 'Pimentones rellenos de pavo', details: '200 g de pavo molido + 2 pimentones + salsa de tomate, sin arroz.', condition: 'Carne', protein: 42, calories: 450 },
  { code: 'D12', category: 'Cena', name: 'Osobuco con verduras', details: '180 g de osobuco cocido sin hueso + verduras de olla o ensalada.', condition: 'Carne', protein: 49, calories: 460, note: 'Pesar solo la parte comestible.' },
  { code: 'D13', category: 'Cena', name: 'Sopa de pescado completa', details: '200 g de merluza o reineta + 100 g de papa + zapallo, zanahoria, cebolla y apio.', condition: 'Parve', protein: 46, calories: 376, note: 'Sin pan.' },
  { code: 'D14', category: 'Cena', name: 'Ensalada de atún y lentejas', details: '1 lata de atún (90 g) + 150 g de lentejas + tomate, pepino y cebolla.', condition: 'Parve', protein: 35.5, calories: 323, note: 'Sin aceite o máximo spray medido.' },
  { code: 'D15', category: 'Cena', name: 'Atún + 3 huevos + ensalada', details: '1 lata de atún (90 g) + 3 huevos + ensalada grande.', condition: 'Parve', protein: 38.9, calories: 366 },
  { code: 'D16', category: 'Cena', name: 'Merluza + garbanzos', details: '200 g de merluza o reineta + 100 g de garbanzos + ensalada.', condition: 'Parve', protein: 52.9, calories: 434, note: 'Muy alta en proteína.' }
];
