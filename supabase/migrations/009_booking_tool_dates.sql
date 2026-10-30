-- 009 — Booking tool: clearer answers when the AI passes a wrong date.
--   Call test 30 Oct: speech recognition turned 'Tuesday at 11 30' into 2026-11-30 and 'tenth' into 2026-10-10;
--   the tool now says today's date, treats past or far-away dates as misheard and asks for a weekday name.
--   A FREE answer for 'any doctor' now names the doctor who is free.
-- Run after 008. Safe to re-run.

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
  today    date;
  todaytxt text;
begin
  select cl.id, cl.name, cl.config into c from public.clinics cl where cl.id = p_clinic;
  if c.id is null then return jsonb_build_object('ok', false, 'result', 'Clinic not found. Tell the caller the team will call back to book.'); end if;
  cfg := coalesce(c.config, '{}'::jsonb);
  tz := coalesce(nullif(cfg ->> 'timezone', ''), 'Asia/Dubai');
  today := (now() at time zone tz)::date;
  todaytxt := trim(to_char(today, 'FMDay FMDD FMMonth'));
  d := public.resolve_clinic_day(tz, p_args ->> 'day');
  if d is null then
    return jsonb_build_object('ok', false, 'result', format('Today is %s. Day not understood. Ask the caller which day they want, and pass it as a weekday name such as tuesday.', todaytxt));
  end if;
  if d < today then
    return jsonb_build_object('ok', false, 'result', format('Today is %s. %s is in the past, so the day was probably misheard. Do not mention that date to the caller: ask again which day they want and pass it as a weekday name such as tuesday.', todaytxt, trim(to_char(d, 'FMDay FMDD FMMonth'))));
  end if;
  if d > today + 60 then
    return jsonb_build_object('ok', false, 'result', format('Today is %s. %s is more than two months away, so the day was probably misheard. Ask the caller which day they mean and pass it as a weekday name such as tuesday.', todaytxt, trim(to_char(d, 'FMDay FMDD FMMonth YYYY'))));
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
      select f.* into pick from public.get_free_slots(p_clinic, d, doc, mins) f where f.local_time = to_char(want, 'HH24:MI') limit 1;
      if pick.starts_at is not null then
        return jsonb_build_object('ok', true, 'free', true, 'result',
          format('%s at %s is FREE%s. Offer it to the caller.', daytxt, to_char(want, 'HH24:MI'), case when pick.doctor <> '' then ' with ' || pick.doctor else '' end));
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

revoke all on function public.run_booking_tool(uuid, text, jsonb, text, text, text) from public, anon, authenticated;
