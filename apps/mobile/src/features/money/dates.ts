const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight of a YYYY-MM-DD string. */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Monday of d's week, at local midnight. */
export function startOfWeek(d: Date): Date {
  const offset = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset);
}

export function weekDays(d: Date): Date[] {
  const monday = startOfWeek(d);
  return Array.from(
    { length: 7 },
    (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i),
  );
}

export function monthRange(d: Date): { start: string; end: string } {
  return {
    start: toISODate(new Date(d.getFullYear(), d.getMonth(), 1)),
    end: toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
  };
}

export function greeting(d: Date): string {
  const h = d.getHours();
  if (h >= 5 && h <= 11) return 'Good morning';
  if (h >= 12 && h <= 16) return 'Good afternoon';
  return 'Good evening';
}

export function daysUntil(iso: string, today: Date): number {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((parseISODate(iso).getTime() - t.getTime()) / 86_400_000);
}

/** `DD/MM/YYYY` to ISO, or null when it is not a real calendar date. */
export function parseDisplayDate(s: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!match) return null;
  const [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(y, m - 1, d);
  const real =
    date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  return real ? toISODate(date) : null;
}
