// All "today" / hour logic runs in the clinic's timezone, not the viewer's.

function parts(date: Date, tz: string) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') };
}

/** YYYY-MM-DD of `date` as seen in `tz`. */
export function dayKey(date: Date | string, tz: string): string {
  const { y, m, d } = parts(new Date(date), tz);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Minutes since local midnight in `tz`. */
export function minutesOfDay(date: Date | string, tz: string): number {
  const { h, mi } = parts(new Date(date), tz);
  return h * 60 + mi;
}

/** Shift a YYYY-MM-DD key by n days. */
export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** UTC Date for a wall-clock time (key + minutes) in `tz`. */
export function zonedToDate(key: string, minutes: number, tz: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const p = parts(new Date(guess), tz);
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - guess;
  return new Date(guess - offset);
}

export function formatTime(date: Date | string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(date));
}

export function formatHM(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** "Fri, Oct 24, 2026" for a day key. */
export function formatDayLong(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatDayShort(key: string): { weekday: string; date: string } {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return {
    weekday: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(dt),
    date: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(dt),
  };
}

export function formatDuration(sec: number | null): string {
  if (sec == null) return '—';
  return `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, '0')}s`;
}

export function formatDurationLong(sec: number | null): string {
  if (sec == null) return '';
  const m = Math.floor(sec / 60), s = sec % 60;
  return m ? `${m} min ${String(s).padStart(2, '0')} sec` : `${s} sec`;
}
