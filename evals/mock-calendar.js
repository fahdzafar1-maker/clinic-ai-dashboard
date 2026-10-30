// In-memory copy of Supabase run_booking_tool (migrations 008 + 009) for repeatable evals.
// Works in clinic-local time on a fixed "now"; same opening-hour rules, 30-minute grid, per-doctor overlap check and answer texts.
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const toDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fmt = (dt) => dt.toISOString().slice(0, 10);
const addDays = (dt, n) => new Date(dt.getTime() + n * 864e5);
const dayText = (dt) => DAYS[dt.getUTCDay()].replace(/^./, (c) => c.toUpperCase()) + ' ' + dt.getUTCDate() + ' ' + MONTHS[dt.getUTCMonth()];
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const hhmm = (min) => String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');

function createCalendar(clinic, nowIso) {
  const cfg = clinic.config;
  const nowDate = new Date(nowIso);
  const today = toDate(fmt(nowDate));
  const nowMin = nowDate.getUTCHours() * 60 + nowDate.getUTCMinutes(); // fixtures use a UTC-equal timezone (London in GMT)
  const booked = clinic.booked.map((b) => ({ ...b }));
  const log = [];

  function hours(dt) {
    const v = (cfg.schedule || {})[KEYS[dt.getUTCDay()]];
    const m = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(v || '');
    return m ? { opens: +m[1] * 60 + +m[2], closes: +m[3] * 60 + +m[4] } : null;
  }
  function resolveDay(text) {
    const d = String(text || '').trim().toLowerCase();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return toDate(d);
    if (d === '' || d === 'today') return today;
    if (d === 'tomorrow') return addDays(today, 1);
    if (d === 'day after tomorrow') return addDays(today, 2);
    for (let i = 0; i < 7; i++) {
      if (d.includes(DAYS[i])) return addDays(today, ((i - today.getUTCDay() + 7) % 7) + (d.startsWith('next ') ? 7 : 0));
    }
    return null;
  }
  function snap(list, value) {
    const q = String(value || '').toLowerCase().replace(/^\s*(dr\.?|doctor)\s+/i, '').trim();
    if (!q) return '';
    const hit = (list || []).find((x) => x.name.toLowerCase().includes(q) || q.split(' ').some((w) => w.length > 2 && x.name.toLowerCase().includes(w)));
    return hit ? hit.name : '';
  }
  function freeSlots(dt, doc, mins) {
    const h = hours(dt);
    if (!h) return [];
    const docs = doc ? [doc] : (cfg.doctors || []).map((d) => d.name);
    if (!docs.length) docs.push('');
    const out = [];
    for (let t = h.opens; t + mins <= h.closes; t += 30) {
      if (fmt(dt) === fmt(today) && t < nowMin + 30) continue;
      const d = docs.find((name) => !booked.some((b) => b.day === fmt(dt) && b.doctor === name && toMin(b.time) < t + mins && t < toMin(b.time) + b.minutes));
      if (d !== undefined) out.push({ time: hhmm(t), doctor: d });
    }
    return out;
  }

  function run(tool, args, phone) {
    const todayTxt = dayText(today);
    const d = resolveDay(args.day);
    if (!d) return { ok: false, result: `Today is ${todayTxt}. Day not understood. Ask the caller which day they want, and pass it as a weekday name such as tuesday.` };
    if (d < today) return { ok: false, result: `Today is ${todayTxt}. ${dayText(d)} is in the past, so the day was probably misheard. Do not mention that date to the caller: ask again which day they want and pass it as a weekday name such as tuesday.` };
    if (d > addDays(today, 60)) return { ok: false, result: `Today is ${todayTxt}. ${dayText(d)} ${d.getUTCFullYear()} is more than two months away, so the day was probably misheard. Ask the caller which day they mean and pass it as a weekday name such as tuesday.` };
    const dt = dayText(d);
    const doc = snap(cfg.doctors, args.doctor);
    const svc = snap(cfg.services, args.service) || null;
    const mins = (svc && (cfg.services.find((s) => s.name === svc) || {}).minutes) || 30;
    const m = /(\d{1,2})[:.]?(\d{2})?/.exec(String(args.time || ''));
    const want = m && +m[1] <= 23 ? hhmm(+m[1] * 60 + +(m[2] || 0)) : null;
    const h = hours(d);
    if (!h) return { ok: false, result: `The clinic is closed on ${dt}. Offer another day.` };
    const slots = freeSlots(d, doc, mins);
    const near = () => want ? slots.slice().sort((a, b) => Math.abs(toMin(a.time) - toMin(want)) - Math.abs(toMin(b.time) - toMin(want))).slice(0, 3) : [];
    const label = (s) => s.time + (s.doctor && !doc ? ` (${s.doctor})` : '');

    if (tool === 'check_availability') {
      if (!slots.length) return { ok: true, free: false, result: `No free time on ${dt}${doc ? ' with ' + doc : ''}. Offer to check another day.` };
      if (want) {
        const pick = slots.find((s) => s.time === want);
        if (pick) return { ok: true, free: true, result: `${dt} at ${want} is FREE${pick.doctor ? ' with ' + pick.doctor : ''}. Offer it to the caller.` };
        return { ok: true, free: false, result: `${dt} at ${want} is NOT free${doc ? ' with ' + doc : ''} (outside opening hours or already booked). Nearest free times that day: ${near().map(label).join(', ')}. Offer one or two of these.` };
      }
      return { ok: true, free: true, result: `Free times on ${dt}${doc ? ' with ' + doc : ''} (opening hours ${hhmm(h.opens)}-${hhmm(h.closes)}): ${slots.slice(0, 12).map(label).join(', ')}. Mention two or three that fit what the caller wants.` };
    }
    if (tool === 'book_appointment') {
      if (!want) return { ok: false, result: 'Time missing. Ask which time the caller wants, then check availability.' };
      const pname = String(args.patient_name || '').trim();
      if (!pname) return { ok: false, result: 'Patient name missing. Ask for the full name first.' };
      const pick = slots.find((s) => s.time === want);
      if (!pick) return { ok: false, result: `NOT booked: ${dt} at ${want} is no longer free. Nearest free times: ${near().map((s) => s.time).join(', ') || 'none that day'}. Ask the caller to choose one.` };
      booked.push({ day: fmt(d), time: want, doctor: pick.doctor, minutes: mins });
      const booking = { day: fmt(d), time: want, doctor: pick.doctor, service: svc, patient_name: pname, phone };
      log.push(booking);
      return { ok: true, booking, result: `BOOKED: ${pname}, ${svc || 'appointment'} on ${dt} at ${want}${pick.doctor ? ' with ' + pick.doctor : ''}. Tell the caller it is booked, that they will get a confirmation message with instructions, and that the ${pick.doctor ? 'doctor' : 'clinic'} has been informed.` };
    }
    return { ok: false, result: 'Unknown tool.' };
  }

  return { run, bookings: log, todayText: dayText(today) };
}

module.exports = { createCalendar };
