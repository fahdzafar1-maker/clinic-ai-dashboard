-- 008 — Real appointments: the AI checks free slots and books for real.
--   * appointments: one row per booking. The database itself refuses two bookings for the same
--     doctor at overlapping times (exclusion constraint), so a race between two callers cannot double-book.
--   * patients: the clinic's patient list (CRM), filled by every booking.
--   * outbox: messages to doctors and patients. Bookings queue a doctor note and a patient confirmation;
--     a cancellation made by staff queues the doctor note and a patient message that waits for
--     staff approval ('needs_approval') before it is sent.
--   * Opening hours: config.schedule = { "mon": "09:00-18:00", ..., "sun": null } (closed = null/missing).
--     Without a schedule: config.openHour–closeHour, Monday to Saturday.
--   * run_booking_tool(): used by n8n (service key only) for the AI's check_availability / book_appointment.
--   * log_call(): end-of-call logging that updates the booking row of the same call instead of adding a second one.
--   * cancel_appointment() / approve_message(): for clinic staff in the dashboard.
-- Run after 007. Safe to re-run.

create extension if not exists btree_gist;

alter table public.activity add column if not exists call_id text;
create index if not exists activity_call_id_idx on public.activity (call_id) where call_id is not null;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.patients (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics (id) on delete cascade,
  name            text,
  phone           text not null,
  email           text,
  notes           text,
  created_at      timestamptz not null default now(),
  last_contact_at timestamptz not null default now(),
  unique (clinic_id, phone)
);

create table if not exists public.appointments (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references public.clinics (id) on delete cascade,
  patient_id    uuid references public.patients (id) on delete set null,
  patient_name  text,
  patient_phone text,
  doctor        text not null default '',
  service       text,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  status        text not null default 'booked' check (status in ('booked', 'cancelled', 'completed', 'no_show')),
  source        text not null default 'call' check (source in ('call', 'web', 'whatsapp', 'manual')),
  call_id       text,
  activity_id   uuid references public.activity (id) on delete set null,
  notes         text,
  created_at    timestamptz not null default now(),
  cancelled_at  timestamptz,
  cancel_reason text,
  check (ends_at > starts_at),
  constraint appointments_no_overlap exclude using gist (
    clinic_id with =, doctor with =, tstzrange(starts_at, ends_at) with &&
  ) where (status = 'booked')
);
create index if not exists appointments_clinic_start_idx on public.appointments (clinic_id, starts_at);

create table if not exists public.outbox (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references public.clinics (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete cascade,
  audience       text not null check (audience in ('patient', 'doctor', 'staff')),
  channel        text not null check (channel in ('whatsapp', 'email', 'sms')),
  kind           text not null default 'booking' check (kind in ('booking', 'cancellation', 'reminder', 'other')),
  to_name        text,
  to_address     text,
  body           text not null,
  status         text not null default 'queued' check (status in ('needs_approval', 'queued', 'sent', 'failed', 'cancelled')),
  created_at     timestamptz not null default now(),
  approved_at    timestamptz,
  approved_by    uuid,
  sent_at        timestamptz,
  error          text
);
create index if not exists outbox_status_idx on public.outbox (status, created_at);

alter table public.patients enable row level security;
alter table public.appointments enable row level security;
alter table public.outbox enable row level security;

drop policy if exists "members read patients" on public.patients;
create policy "members read patients" on public.patients
  for select to authenticated using (public.is_clinic_member(clinic_id));
drop policy if exists "members read appointments" on public.appointments;
create policy "members read appointments" on public.appointments
  for select to authenticated using (public.is_clinic_member(clinic_id));
drop policy if exists "members read outbox" on public.outbox;
create policy "members read outbox" on public.outbox
  for select to authenticated using (public.is_clinic_member(clinic_id));

-- ---------------------------------------------------------------------------
-- Opening hours of a clinic on a given local date → (opens, closes); no row = closed.
-- ---------------------------------------------------------------------------
create or replace function public.clinic_hours(p_cfg jsonb, p_day date)
returns table (opens time, closes time)
language plpgsql immutable set search_path = '' as $$
declare
  k   text := (array['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])[extract(dow from p_day)::int + 1];
  v   text;
  m   text[];
begin
  if p_cfg ? 'schedule' and jsonb_typeof(p_cfg -> 'schedule') = 'object' then
    v := p_cfg -> 'schedule' ->> k;
    m := regexp_match(coalesce(v, ''), '^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$');
    if m is null then return; end if;
    opens := make_time(m[1]::int, m[2]::int, 0);
    closes := case when m[3]::int >= 24 then time '23:59' else make_time(m[3]::int, m[4]::int, 0) end;
    if closes > opens then return next; end if;
    return;
  end if;
  if k = 'sun' then return; end if;
  opens := make_time(least(greatest(coalesce((p_cfg ->> 'openHour')::int, 9), 0), 23), 0, 0);
  closes := case when coalesce((p_cfg ->> 'closeHour')::int, 18) >= 24 then time '23:59'
                 else make_time(greatest(coalesce((p_cfg ->> 'closeHour')::int, 18), 1), 0, 0) end;
  if closes > opens then return next; end if;
end;
$$;

-- 'today' / 'tomorrow' / 'monday'… / 'YYYY-MM-DD' → local date of the clinic (null if not understood).
create or replace function public.resolve_clinic_day(p_tz text, p_day text)
returns date
language plpgsql stable set search_path = '' as $$
declare
  today date := (now() at time zone p_tz)::date;
  d     text := lower(trim(coalesce(p_day, '')));
  names text[] := array['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  i     int;
begin
  if d ~ '^\d{4}-\d{2}-\d{2}$' then return d::date; end if;
  if d in ('', 'today') then return today; end if;
  if d = 'tomorrow' then return today + 1; end if;
  if d = 'day after tomorrow' then return today + 2; end if;
  for i in 1..7 loop
    if position(names[i] in d) > 0 then
      return today + (((i - 1) - extract(dow from today)::int + 7) % 7) + case when d like 'next %' then 7 else 0 end;
    end if;
  end loop;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Free start times of one day (30-minute grid), for one doctor or for any doctor.
-- ---------------------------------------------------------------------------
create or replace function public.get_free_slots(p_clinic uuid, p_day date, p_doctor text default '', p_minutes int default 30)
returns table (starts_at timestamptz, local_time text, doctor text)
language plpgsql stable security definer set search_path = '' as $$
declare
  cfg     jsonb;
  tz      text;
  h       record;
  docs    text[];
  t       timestamp;
  s       timestamptz;
  mins    int := greatest(coalesce(p_minutes, 30), 15);
  dname   text;
begin
  select c.config into cfg from public.clinics c where c.id = p_clinic;
  if cfg is null then return; end if;
  tz := coalesce(nullif(cfg ->> 'timezone', ''), 'Asia/Dubai');
  select * into h from public.clinic_hours(cfg, p_day);
  if h.opens is null then return; end if;

  if coalesce(p_doctor, '') <> '' then
    docs := array[p_doctor];
  else
    select coalesce(array_agg(x ->> 'name'), array[''])
      into docs
      from jsonb_array_elements(case when jsonb_typeof(cfg -> 'doctors') = 'array' then cfg -> 'doctors' else '[]'::jsonb end) x
     where coalesce(x ->> 'name', '') <> '';
  end if;

  for t in select generate_series(p_day + h.opens, p_day + h.closes - make_interval(mins => mins), interval '30 minutes') loop
    s := t at time zone tz;
    continue when s < now() + interval '30 minutes';
    foreach dname in array docs loop
      if not exists (
        select 1 from public.appointments a
         where a.clinic_id = p_clinic and a.status = 'booked' and a.doctor = dname
           and tstzrange(a.starts_at, a.ends_at) && tstzrange(s, s + make_interval(mins => mins))
      ) then
        starts_at := s; local_time := to_char(t, 'HH24:MI'); doctor := dname;
        return next;
        exit;
      end if;
    end loop;
  end loop;
end;
$$;

-- Snap a name the AI heard to the clinic's own list (doctors or services); '' if no match.
create or replace function public.snap_to_list(p_list jsonb, p_value text)
returns text
language sql immutable set search_path = '' as $$
  with v as (select lower(regexp_replace(coalesce(p_value, ''), '^\s*(dr\.?|doctor)\s+', '', 'i')) as q)
  select coalesce((
    select x ->> 'name'
      from jsonb_array_elements(case when jsonb_typeof(p_list) = 'array' then p_list else '[]'::jsonb end) x, v
     where v.q <> '' and (
           lower(x ->> 'name') like '%' || v.q || '%'
        or exists (select 1 from unnest(string_to_array(v.q, ' ')) w
                    where length(w) > 2 and lower(x ->> 'name') like '%' || w || '%'))
     limit 1), '');
$$;

-- ---------------------------------------------------------------------------
-- The AI's tools (n8n calls this with the service key)
--   check_availability { day, time?, doctor?, service? }
--   book_appointment   { day, time, patient_name, doctor?, service? }
-- Returns { result: text for the AI, ok: bool, ... }.
-- ---------------------------------------------------------------------------
create or replace function public.run_booking_tool(p_clinic uuid, p_tool text, p_args jsonb, p_phone text default null, p_call_id text default null, p_source text default 'call')
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c        record;
  cfg      jsonb;
  tz       text;
  d        date;
  want     time;
  doc      text;
  svc      text;
  mins     int;
  slots    text[];
  near     text[];
  pick     record;
  pid      uuid;
  aid      uuid;
  act      uuid;
  pname    text;
  daytxt   text;
  docmail  text;
  notify   text;
  instr    text;
  hours    record;
  m        text[];
begin
  select cl.id, cl.name, cl.config into c from public.clinics cl where cl.id = p_clinic;
  if c.id is null then return jsonb_build_object('ok', false, 'result', 'Clinic not found. Tell the caller the team will call back to book.'); end if;
  cfg := coalesce(c.config, '{}'::jsonb);
  tz := coalesce(nullif(cfg ->> 'timezone', ''), 'Asia/Dubai');
  d := public.resolve_clinic_day(tz, p_args ->> 'day');
  if d is null then
    return jsonb_build_object('ok', false, 'result', 'Day not understood. Ask the caller which day they want (today, tomorrow, a weekday or a date).');
  end if;
  if d < (now() at time zone tz)::date then
    return jsonb_build_object('ok', false, 'result', 'That day is in the past. Ask for a day from today on.');
  end if;
  daytxt := trim(to_char(d, 'FMDay FMDD FMMonth'));

  doc := public.snap_to_list(cfg -> 'doctors', p_args ->> 'doctor');
  svc := nullif(public.snap_to_list(cfg -> 'services', p_args ->> 'service'), '');
  select coalesce((x ->> 'minutes')::int, 30) into mins
    from jsonb_array_elements(case when jsonb_typeof(cfg -> 'services') = 'array' then cfg -> 'services' else '[]'::jsonb end) x
   where x ->> 'name' = svc limit 1;
  mins := coalesce(mins, 30);

  m := regexp_match(coalesce(p_args ->> 'time', ''), '(\d{1,2})[:.]?(\d{2})?');
  if m is not null and m[1]::int between 0 and 23 then want := make_time(m[1]::int, coalesce(m[2], '0')::int, 0); end if;

  select * into hours from public.clinic_hours(cfg, d);
  if hours.opens is null then
    return jsonb_build_object('ok', false, 'result', format('The clinic is closed on %s. Offer another day.', daytxt));
  end if;

  -- check_availability ------------------------------------------------------
  if p_tool = 'check_availability' then
    select array_agg(f.local_time || case when f.doctor <> '' and doc = '' then ' (' || f.doctor || ')' else '' end order by f.starts_at)
      into slots from public.get_free_slots(p_clinic, d, doc, mins) f;
    if slots is null then
      return jsonb_build_object('ok', true, 'free', false, 'result',
        format('No free time on %s%s. Offer to check another day.', daytxt, case when doc <> '' then ' with ' || doc else '' end));
    end if;
    if want is not null then
      if exists (select 1 from public.get_free_slots(p_clinic, d, doc, mins) f where f.local_time = to_char(want, 'HH24:MI')) then
        return jsonb_build_object('ok', true, 'free', true, 'result',
          format('%s at %s is FREE%s. Offer it to the caller.', daytxt, to_char(want, 'HH24:MI'), case when doc <> '' then ' with ' || doc else '' end));
      end if;
      select array_agg(x.t order by x.dist) into near from (
        select f.local_time || case when f.doctor <> '' and doc = '' then ' (' || f.doctor || ')' else '' end as t,
               abs(extract(epoch from (f.local_time::time - want))) as dist
          from public.get_free_slots(p_clinic, d, doc, mins) f order by 2 limit 3) x;
      return jsonb_build_object('ok', true, 'free', false, 'result',
        format('%s at %s is NOT free%s (outside opening hours or already booked). Nearest free times that day: %s. Offer one or two of these.',
               daytxt, to_char(want, 'HH24:MI'), case when doc <> '' then ' with ' || doc else '' end, array_to_string(near, ', ')));
    end if;
    return jsonb_build_object('ok', true, 'free', true, 'result',
      format('Free times on %s%s (opening hours %s-%s): %s. Mention two or three that fit what the caller wants.',
             daytxt, case when doc <> '' then ' with ' || doc else '' end, to_char(hours.opens, 'HH24:MI'), to_char(hours.closes, 'HH24:MI'),
             array_to_string(slots[1:12], ', ')));
  end if;

  -- book_appointment ----------------------------------------------------------
  if p_tool = 'book_appointment' then
    if want is null then
      return jsonb_build_object('ok', false, 'result', 'Time missing. Ask which time the caller wants, then check availability.');
    end if;
    pname := nullif(trim(coalesce(p_args ->> 'patient_name', '')), '');
    if pname is null then
      return jsonb_build_object('ok', false, 'result', 'Patient name missing. Ask for the full name first.');
    end if;
    select f.* into pick from public.get_free_slots(p_clinic, d, doc, mins) f where f.local_time = to_char(want, 'HH24:MI') limit 1;
    if pick.starts_at is null then
      select array_agg(x.t order by x.dist) into near from (
        select f.local_time as t, abs(extract(epoch from (f.local_time::time - want))) as dist
          from public.get_free_slots(p_clinic, d, doc, mins) f order by 2 limit 3) x;
      return jsonb_build_object('ok', false, 'result',
        format('NOT booked: %s at %s is no longer free. Nearest free times: %s. Ask the caller to choose one.',
               daytxt, to_char(want, 'HH24:MI'), coalesce(array_to_string(near, ', '), 'none that day')));
    end if;

    if coalesce(p_phone, '') <> '' then
      insert into public.patients (clinic_id, name, phone)
      values (p_clinic, pname, p_phone)
      on conflict (clinic_id, phone) do update set name = coalesce(excluded.name, public.patients.name), last_contact_at = now()
      returning id into pid;
    end if;

    insert into public.activity (clinic_id, channel, event, patient_name, phone_masked, summary, outcome, appointment_time, doctor, service, call_id)
    values (p_clinic, case when p_source in ('web', 'whatsapp') then p_source else 'call' end, 'conversation', pname, p_phone,
            format('Booked %s for %s at %s%s.', coalesce(svc, 'an appointment'), daytxt, pick.local_time, case when pick.doctor <> '' then ' with ' || pick.doctor else '' end),
            'booked', pick.starts_at, nullif(pick.doctor, ''), svc, p_call_id)
    returning id into act;

    begin
      insert into public.appointments (clinic_id, patient_id, patient_name, patient_phone, doctor, service, starts_at, ends_at, source, call_id, activity_id)
      values (p_clinic, pid, pname, p_phone, pick.doctor, svc, pick.starts_at, pick.starts_at + make_interval(mins => mins),
              case when p_source in ('web', 'whatsapp', 'manual') then p_source else 'call' end, p_call_id, act)
      returning id into aid;
    exception when exclusion_violation then
      delete from public.activity where id = act;
      return jsonb_build_object('ok', false, 'result', 'NOT booked: that time was just taken. Check availability again and offer another time.');
    end;

    -- Messages: doctor (or clinic) note + patient confirmation with instructions.
    select x ->> 'email' into docmail
      from jsonb_array_elements(case when jsonb_typeof(cfg -> 'doctors') = 'array' then cfg -> 'doctors' else '[]'::jsonb end) x
     where x ->> 'name' = pick.doctor limit 1;
    notify := coalesce(nullif(docmail, ''), nullif(cfg ->> 'notifyEmail', ''));
    instr := coalesce(nullif(cfg -> 'receptionist' ->> 'patientInstructions', ''),
      'Please arrive 10 minutes early and bring a photo ID and a list of any medicines you take. To change or cancel, please call us at least 2 working days before.');

    insert into public.outbox (clinic_id, appointment_id, audience, channel, kind, to_name, to_address, body)
    values
      (p_clinic, aid, 'doctor', 'email', 'booking', coalesce(nullif(pick.doctor, ''), c.name), notify,
       format('New booking at %s: %s, %s on %s at %s%s. Booked by the AI receptionist.',
              c.name, pname, coalesce(svc, 'appointment'), daytxt, pick.local_time, case when pick.doctor <> '' then ' with ' || pick.doctor else '' end)),
      (p_clinic, aid, 'patient', 'whatsapp', 'booking', pname, p_phone,
       format('Hello %s, your appointment at %s is confirmed: %s on %s at %s%s. %s',
              pname, c.name, coalesce(svc, 'appointment'), daytxt, pick.local_time, case when pick.doctor <> '' then ' with ' || pick.doctor else '' end, instr));

    return jsonb_build_object('ok', true, 'appointment_id', aid, 'result',
      format('BOOKED: %s, %s on %s at %s%s. Tell the caller it is booked, that they will get a confirmation message with instructions, and that the %s has been informed.',
             pname, coalesce(svc, 'appointment'), daytxt, pick.local_time, case when pick.doctor <> '' then ' with ' || pick.doctor else '' end,
             case when pick.doctor <> '' then 'doctor' else 'clinic' end));
  end if;

  return jsonb_build_object('ok', false, 'result', 'Unknown tool.');
end;
$$;

-- ---------------------------------------------------------------------------
-- End-of-call logging: if the AI booked during this call, update that row; otherwise add one.
-- ---------------------------------------------------------------------------
create or replace function public.log_call(p_row jsonb)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  cid text := nullif(p_row ->> 'call_id', '');
begin
  -- The AI had calendar tools but never booked: the call summary alone is not a booking.
  if coalesce((p_row ->> 'calendar_tools')::boolean, false) and p_row ->> 'outcome' = 'booked'
     and not exists (select 1 from public.activity where call_id = cid) then
    p_row := p_row || jsonb_build_object('outcome', 'forwarded', 'appointment_time', null,
      'summary', 'Not booked in the calendar, please call back: ' || coalesce(p_row ->> 'summary', ''));
  end if;
  if cid is not null and exists (select 1 from public.activity where call_id = cid) then
    update public.activity
       set summary      = coalesce(nullif(p_row ->> 'summary', ''), summary),
           language     = coalesce(nullif(p_row ->> 'language', ''), language),
           duration_sec = coalesce((p_row ->> 'duration_sec')::int, duration_sec),
           recording_url = coalesce(nullif(p_row ->> 'recording_url', ''), recording_url),
           patient_name = coalesce(patient_name, nullif(p_row ->> 'patient_name', ''))
     where call_id = cid;
    return;
  end if;
  insert into public.activity (clinic_id, channel, event, patient_name, phone_masked, language, summary, outcome,
                               duration_sec, recording_url, appointment_time, doctor, service, call_id)
  values ((p_row ->> 'clinic_id')::uuid, coalesce(p_row ->> 'channel', 'call'), coalesce(p_row ->> 'event', 'conversation'),
          nullif(p_row ->> 'patient_name', ''), nullif(p_row ->> 'phone_masked', ''), nullif(p_row ->> 'language', ''),
          nullif(p_row ->> 'summary', ''), coalesce(p_row ->> 'outcome', 'info'), (p_row ->> 'duration_sec')::int,
          nullif(p_row ->> 'recording_url', ''), (p_row ->> 'appointment_time')::timestamptz,
          nullif(p_row ->> 'doctor', ''), nullif(p_row ->> 'service', ''), cid);
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff actions (dashboard)
-- ---------------------------------------------------------------------------
-- Cancel a booking: the slot becomes free, the doctor is told at once, and the patient
-- message waits for a staff member to approve it.
create or replace function public.cancel_appointment(p_id uuid, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  a     record;
  cname text;
  cfg   jsonb;
  tz    text;
  when_ text;
  docmail text;
begin
  select * into a from public.appointments where id = p_id;
  if a.id is null or not public.is_clinic_member(a.clinic_id) then raise exception 'not allowed'; end if;
  if a.status <> 'booked' then return jsonb_build_object('ok', false, 'status', a.status); end if;
  select c.name, c.config into cname, cfg from public.clinics c where c.id = a.clinic_id;
  tz := coalesce(nullif(cfg ->> 'timezone', ''), 'Asia/Dubai');
  when_ := trim(to_char(a.starts_at at time zone tz, 'FMDay FMDD FMMonth "at" HH24:MI'));

  update public.appointments set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason where id = p_id;
  update public.activity set outcome = 'cancelled' where id = a.activity_id;

  select x ->> 'email' into docmail
    from jsonb_array_elements(case when jsonb_typeof(cfg -> 'doctors') = 'array' then cfg -> 'doctors' else '[]'::jsonb end) x
   where x ->> 'name' = a.doctor limit 1;

  insert into public.outbox (clinic_id, appointment_id, audience, channel, kind, to_name, to_address, body, status)
  values
    (a.clinic_id, a.id, 'doctor', 'email', 'cancellation', coalesce(nullif(a.doctor, ''), cname),
     coalesce(nullif(docmail, ''), nullif(cfg ->> 'notifyEmail', '')),
     format('Cancelled at %s: %s, %s on %s.%s', cname, coalesce(a.patient_name, 'patient'), coalesce(a.service, 'appointment'), when_,
            case when coalesce(p_reason, '') <> '' then ' Reason: ' || p_reason else '' end), 'queued'),
    (a.clinic_id, a.id, 'patient', 'whatsapp', 'cancellation', a.patient_name, a.patient_phone,
     format('Hello %s, your appointment at %s on %s has been cancelled. Please call us or reply here to book a new time.',
            coalesce(a.patient_name, ''), cname, when_), 'needs_approval');
  return jsonb_build_object('ok', true);
end;
$$;

-- A staff member checked a patient message: it may now be sent.
create or replace function public.approve_message(p_id uuid, p_body text default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare o record;
begin
  select * into o from public.outbox where id = p_id;
  if o.id is null or not public.is_clinic_member(o.clinic_id) then raise exception 'not allowed'; end if;
  if o.status <> 'needs_approval' then return jsonb_build_object('ok', false, 'status', o.status); end if;
  update public.outbox
     set status = 'queued', approved_at = now(), approved_by = auth.uid(), body = coalesce(nullif(trim(p_body), ''), body)
   where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.get_free_slots(uuid, date, text, int) from public, anon, authenticated;
revoke all on function public.run_booking_tool(uuid, text, jsonb, text, text, text) from public, anon, authenticated;
revoke all on function public.log_call(jsonb) from public, anon, authenticated;
revoke all on function public.cancel_appointment(uuid, text) from public, anon;
revoke all on function public.approve_message(uuid, text) from public, anon;
grant execute on function public.cancel_appointment(uuid, text) to authenticated;
grant execute on function public.approve_message(uuid, text) to authenticated;
