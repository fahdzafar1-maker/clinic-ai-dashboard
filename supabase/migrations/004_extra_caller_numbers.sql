-- 004 — Extra caller numbers per demo.
-- A demo clinic can list more phone numbers (config.receptionist.callerNumbers),
-- e.g. the agency's own test phone or the clinic's staff phones. Calls from
-- those numbers reach that demo. Run after 003. Safe to re-run.

create or replace function public.find_demo_clinic(p_phone text, p_code text default null)
returns table (id uuid, slug text, name text, config jsonb, demo_code text, matched_by text)
language sql stable security definer set search_path = '' as $$
  with caller as (
    select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as digits,
           upper(trim(coalesce(p_code, ''))) as code
  ),
  live as (
    select c.* from public.clinics c
    where c.status in ('demo', 'trial', 'active') and (c.expires_at is null or c.expires_at > now())
  ),
  candidates as (
    -- 1) demo code
    select l.id, l.slug, l.name, l.config, l.demo_code, 'code'::text as matched_by, 1 as rank, now() as at
    from live l, caller
    where caller.code <> '' and l.demo_code = caller.code
    union all
    -- 2) extra caller numbers saved on the clinic (most recently edited clinic wins)
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

revoke all on function public.find_demo_clinic(text, text) from public, anon, authenticated;
