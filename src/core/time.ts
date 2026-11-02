const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Parses `YYYY-MM-DDTHH:MM` as local time. Returns null when the text has the
 * wrong shape or names a date that does not exist.
 */
export function parseTimestamp(text: string): number | null {
  const m = TIMESTAMP.exec(text);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number) as [number, number, number, number, number];
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59) return null;
  const date = new Date(year, month - 1, day, hour, minute);
  // A day beyond the end of the month rolls over into the next one.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date.getTime();
}

export function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `HH:MM` in local time. */
export function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** `2 Nov`: day and month in English, whatever the machine locale. */
export function formatDayMonth(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()] ?? ''}`;
}

export function sameLocalDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/** Short human duration: "12 min", "3 h 41 min", "2 d". */
export function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} h ${rest} min` : `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;
