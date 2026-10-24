import { PRESETS } from './presets';
import { addDays, dayKey, zonedToDate } from './time';
import type { Activity, Channel, ClinicConfig, Outcome } from './types';

// Deterministic PRNG so demo data is stable between renders for the same day + preset.
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const NAMES = [
  'Ayesha Khan', 'Bilal Ahmed', 'Fatima Noor', 'Zain Ali', 'Sara Imran', 'Daniel Smith', 'Hana Abed', 'Mohammed Saeed',
  'Lina Faris', 'Omar Khalid', 'Rayan Yusuf', 'Leen Hassan', 'Sami Al-Mansoor', 'Nora Ibrahim', 'Khalid Saeed', 'Nada Fathi',
  'Raed Al Zadjali', 'Tala Al-Ghehhi', 'Fatima Al Mansoor', 'Ahmed Raza', 'Mariam Haddad', 'Yousef Karim', 'Anna Schmidt',
  'Lucas Martin', 'Priya Sharma', 'Elena Ivanova', 'James Walker', 'Noor Al Hashimi', 'Sofia Rossi', 'Hamza Qureshi',
];
const LANGS: [string, number][] = [['English', 0.5], ['Arabic', 0.25], ['Urdu', 0.08], ['Hindi', 0.05], ['Russian', 0.05], ['French', 0.04], ['German', 0.03]];
const PREFIXES = ['50', '52', '54', '55', '56', '58'];

type Rand = () => number;
const pick = <T,>(r: Rand, a: T[]) => a[Math.floor(r() * a.length)];
const int = (r: Rand, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
function weighted<T>(r: Rand, items: [T, number][]): T {
  let x = r();
  for (const [v, w] of items) { if ((x -= w) <= 0) return v; }
  return items[items.length - 1][0];
}

export const DEMO_RECORDING = '/demo-recording.wav';

/** ~2 weeks of history plus bookings for the coming days, relative to `now`. */
export function generateDemo(config: ClinicConfig, now = new Date()): Activity[] {
  const tz = config.timezone;
  const today = dayKey(now, tz);
  const nowMs = now.getTime();
  const preset = PRESETS[config.preset];
  const doctors = config.doctors.length ? config.doctors : preset.doctors;
  const services = config.services.length ? config.services : preset.services;
  const open = config.openHour * 60, close = config.closeHour * 60;

  // Non-overlapping slot allocation per doctor per day.
  const busy = new Map<string, [number, number][]>();
  function allocate(r: Rand, fromDay: string) {
    for (let attempt = 0; attempt < 14; attempt++) {
      const target = addDays(fromDay, int(r, 1, 5));
      const doc = pick(r, doctors), svc = pick(r, services);
      const slots = Math.floor((close - open - svc.minutes) / 15);
      if (slots < 0) return null;
      const start = open + 15 * int(r, 0, slots);
      const end = start + svc.minutes;
      const k = `${doc.name}|${target}`;
      const list = busy.get(k) ?? [];
      if (list.some(([s, e]) => start < e && end > s)) continue;
      list.push([start, end]);
      busy.set(k, list);
      return { doctor: doc.name, service: svc.name, time: zonedToDate(target, start, tz).toISOString() };
    }
    return null;
  }

  const rows: Activity[] = [];
  for (let offset = -13; offset <= 0; offset++) {
    const day = addDays(today, offset);
    const r = mulberry32(hash(`${day}|${config.preset}|${doctors.map((d) => d.name).join()}`));
    const at = () => zonedToDate(day, int(r, 6 * 60, 23 * 60), tz).toISOString();
    const phone = () => `+971${pick(r, PREFIXES)}${int(r, 1000000, 9999999)}`;
    let i = 0;
    const push = (row: Omit<Activity, 'id'>) => rows.push({ id: `demo-${day}-${i++}`, ...row });

    const mix: [Channel, number][] = [['call', int(r, 30, 44)], ['whatsapp', int(r, 18, 30)], ['voice_note', int(r, 2, 5)], ['web', int(r, 4, 9)]];
    for (const [channel, count] of mix) {
      for (let n = 0; n < count; n++) {
        const outcome = weighted<Outcome>(r, [['booked', 0.35], ['info', 0.5], ['forwarded', 0.09], ['cancelled', 0.06]]);
        const slot = outcome === 'booked' ? allocate(r, day) : null;
        const known = channel !== 'call' || r() > 0.4;
        push({
          created_at: at(),
          channel,
          patient_name: known ? pick(r, NAMES) : null,
          phone_masked: phone(),
          language: weighted(r, LANGS),
          summary: pick(r, preset.quotes[outcome]),
          outcome,
          duration_sec: channel === 'call' ? int(r, 25, 320) : channel === 'voice_note' ? int(r, 8, 60) : null,
          recording_url: channel === 'call' || channel === 'voice_note' ? DEMO_RECORDING : null,
          appointment_time: slot?.time ?? null,
          doctor: slot?.doctor ?? (outcome === 'forwarded' && r() > 0.5 ? pick(r, doctors).name : null),
          service: slot?.service ?? null,
          event: 'conversation',
        });
      }
    }

    for (let n = int(r, 3, 8); n > 0; n--) {
      const outcome: Outcome = r() > 0.5 ? 'booked' : 'info';
      const slot = outcome === 'booked' ? allocate(r, day) : null;
      push({
        created_at: at(), channel: 'call', patient_name: r() > 0.3 ? pick(r, NAMES) : null, phone_masked: phone(),
        language: weighted(r, LANGS), summary: 'AI called back a missed call. ' + pick(r, preset.quotes[outcome]),
        outcome, duration_sec: int(r, 30, 200), recording_url: DEMO_RECORDING,
        appointment_time: slot?.time ?? null, doctor: slot?.doctor ?? null, service: slot?.service ?? null, event: 'missed_call_recovered',
      });
    }

    for (let n = int(r, 14, 26); n > 0; n--) {
      push({
        created_at: at(), channel: 'whatsapp', patient_name: pick(r, NAMES), phone_masked: phone(), language: weighted(r, LANGS),
        summary: `${preset.labels.appointment} reminder sent for tomorrow.`, outcome: 'info', duration_sec: null,
        recording_url: null, appointment_time: null, doctor: null, service: null, event: 'reminder',
      });
    }
  }

  // Only what has "happened" so far; future slots stay blocked so the calendar is stable.
  return rows
    .filter((row) => new Date(row.created_at).getTime() <= nowMs)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** A single fresh row, used to simulate live activity in demo mode. */
export function randomLiveRow(config: ClinicConfig): Activity {
  const r = Math.random;
  const preset = PRESETS[config.preset];
  const channel = weighted<Channel>(r, [['call', 0.5], ['whatsapp', 0.35], ['voice_note', 0.07], ['web', 0.08]]);
  const outcome = weighted<Outcome>(r, [['booked', 0.35], ['info', 0.5], ['forwarded', 0.1], ['cancelled', 0.05]]);
  return {
    id: `live-${Date.now()}`,
    created_at: new Date().toISOString(),
    channel,
    patient_name: channel === 'call' && r() < 0.4 ? null : pick(r, NAMES),
    phone_masked: `+971${pick(r, PREFIXES)}${int(r, 1000000, 9999999)}`,
    language: weighted(r, LANGS),
    summary: pick(r, preset.quotes[outcome]),
    outcome,
    duration_sec: channel === 'call' ? int(r, 25, 320) : channel === 'voice_note' ? int(r, 8, 60) : null,
    recording_url: channel === 'call' || channel === 'voice_note' ? DEMO_RECORDING : null,
    appointment_time: null,
    doctor: null,
    service: null,
    event: 'conversation',
  };
}

