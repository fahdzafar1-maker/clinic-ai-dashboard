import { addDays, dayKey, minutesOfDay } from './time';
import type { Activity } from './types';

export type KpiKey = 'aiCalls' | 'forwarded' | 'booked' | 'cancelled' | 'whatsapp' | 'recovered' | 'reminders';

const isConversation = (a: Activity) => a.event === 'conversation';

/** How each KPI is counted from activity rows. */
export const KPI_RULES: Record<KpiKey, (a: Activity) => boolean> = {
  aiCalls: (a) => isConversation(a) && (a.channel === 'call' || a.channel === 'voice_note') && a.outcome !== 'forwarded',
  forwarded: (a) => a.outcome === 'forwarded',
  booked: (a) => a.outcome === 'booked',
  cancelled: (a) => a.outcome === 'cancelled',
  whatsapp: (a) => isConversation(a) && a.channel === 'whatsapp',
  recovered: (a) => a.event === 'missed_call_recovered',
  reminders: (a) => a.event === 'reminder',
};

export interface KpiValue { today: number; yesterday: number; deltaPct: number | null }

/**
 * Today so far vs. yesterday up to the same clock time, so the comparison is
 * fair at 10 AM as well as at 10 PM.
 */
export function computeKpis(rows: Activity[], tz: string, now = new Date()): Record<KpiKey, KpiValue> {
  const today = dayKey(now, tz);
  const yesterday = addDays(today, -1);
  const cutoff = minutesOfDay(now, tz);
  const out = {} as Record<KpiKey, KpiValue>;
  for (const key of Object.keys(KPI_RULES) as KpiKey[]) out[key] = { today: 0, yesterday: 0, deltaPct: null };

  for (const a of rows) {
    const k = dayKey(a.created_at, tz);
    const isToday = k === today;
    const isYesterday = k === yesterday && minutesOfDay(a.created_at, tz) <= cutoff;
    if (!isToday && !isYesterday) continue;
    for (const key of Object.keys(KPI_RULES) as KpiKey[]) {
      if (KPI_RULES[key](a)) out[key][isToday ? 'today' : 'yesterday']++;
    }
  }
  for (const v of Object.values(out)) {
    v.deltaPct = v.yesterday === 0 ? (v.today === 0 ? 0 : null) : Math.round(((v.today - v.yesterday) / v.yesterday) * 100);
  }
  return out;
}

export interface DayBucket { key: string; handled: number; forwarded: number }

/** AI-handled vs forwarded conversations for `days` days ending `endOffset` days before today. */
export function dailyHandled(rows: Activity[], tz: string, days = 7, endOffset = 0, now = new Date()): DayBucket[] {
  const today = dayKey(now, tz);
  const buckets: DayBucket[] = [];
  const index = new Map<string, DayBucket>();
  for (let i = days - 1; i >= 0; i--) {
    const b = { key: addDays(today, -i - endOffset), handled: 0, forwarded: 0 };
    buckets.push(b);
    index.set(b.key, b);
  }
  for (const a of rows) {
    if (!isConversation(a)) continue;
    const b = index.get(dayKey(a.created_at, tz));
    if (!b) continue;
    if (a.outcome === 'forwarded') b.forwarded++;
    else b.handled++;
  }
  return buckets;
}

/** Booked appointments falling on `key`, grouped by doctor name. */
export function appointmentsOn(rows: Activity[], key: string, tz: string): Activity[] {
  return rows.filter((a) => a.outcome === 'booked' && a.appointment_time && dayKey(a.appointment_time, tz) === key);
}

export function countBy<T extends string>(rows: Activity[], fn: (a: Activity) => T | null): Map<T, number> {
  const m = new Map<T, number>();
  for (const a of rows) {
    const k = fn(a);
    if (k != null) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}
