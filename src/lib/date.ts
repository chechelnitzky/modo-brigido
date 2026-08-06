export function detectTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Santiago';
}

export function dateInTimezone(timezone: string, value = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function prettyDate(date: string): string {
  return new Intl.DateTimeFormat('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(new Date(`${date}T12:00:00`));
}

export function shortDate(date: string): string {
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: '2-digit'
  }).format(new Date(`${date}T12:00:00`));
}

export function completedWorkoutDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;

  const [, year, month, day] = match;
  const localDate = new Date(Number(year), Number(month) - 1, Number(day), 12);
  const weekday = new Intl.DateTimeFormat('es-CL', { weekday: 'long' }).format(localDate);
  return `${weekday}, ${day}/${month}/${year}`;
}
