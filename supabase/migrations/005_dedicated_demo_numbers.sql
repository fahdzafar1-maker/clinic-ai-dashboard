-- 005 — Dedicated AI numbers per clinic.
-- A clinic can own one of our AI numbers (config.receptionist.dedicatedNumber).
-- Every call to that number reaches that clinic, from ANY caller phone.
-- The shared demo number keeps using code / caller number / fallback.
-- Run after 004. Safe to re-run.

drop function if exists public.find_demo_clinic(text, text);
drop function if exists public.find_demo_clinic(text, text, text);

create function public.find_demo_clinic(p_phone text, p_code text default null, p_to text default null)
returns table (id uuid, slug text, name text, config jsonb, demo_code text, matched_by text)
language sql stable security definer set search_path = '' as $$
  with caller as (
    select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as digits,
           upper(trim(coalesce(p_code, ''))) as code,
           regexp_replace(coalesce(p_to, ''), '\D', '', 'g') as to_digits
  ),
  live as (
    select c.* from public.clinics c
    where c.status in ('demo', 'trial', 'active') and (c.expires_at is null or c.expires_at > now())
  ),
  candidates as (
    -- 0) the AI number that was called belongs to one clinic
    select l.id, l.slug, l.name, l.config, l.demo_code, 'dedicated_number'::text as matched_by, 0 as rank, l.updated_at as at
    from live l, caller
    where length(caller.to_digits) >= 8
      and regexp_replace(coalesce(l.config -> 'receptionist' ->> 'dedicatedNumber', ''), '\D', '', 'g') = caller.to_digits
    union all
    -- 1) demo code
    select l.id, l.slug, l.name, l.config, l.demo_code, 'code', 1, now()
    from live l, caller
    where caller.code <> '' and l.demo_code = caller.code
    union all
    -- 2) extra caller numbers saved on the clinic
    select l.id, l.slug, l.name, l.config, l.demo_code, 'extra_number', 2, l.updated_at
    from live l, caller,
         jsonb_array_elements_text(coalesce(l.config -> 'receptionist' -> 'callerNumbers', '[]'::jsonb)) as n(num)
    where length(caller.digits) >= 8
      and regexp_replace(n.num, '\D', '', 'g') = caller.digits
    union all
    -- 3) the number given on the demo request
    select l.id, l.slug, l.name, l.config, l.demo_code, 'phone', 3, ld.created_at
    from public.leads ld
    join live l on l.id = ld.clinic_id, caller
    where length(caller.digits) >= 8
      and regexp_replace(coalesce(ld.phone, ''), '\D', '', 'g') = caller.digits
    union all
    -- 4) fallback: the showcase clinic
    select c.id, c.slug, c.name, c.config, c.demo_code, 'fallback', 4, c.created_at
    from public.clinics c
    where c.slug = 'elite-clinic-dubai'
  )
  select id, slug, name, config, demo_code, matched_by
  from candidates
  order by rank, at desc
  limit 1;
$$;

revoke all on function public.find_demo_clinic(text, text, text) from public, anon, authenticated;
