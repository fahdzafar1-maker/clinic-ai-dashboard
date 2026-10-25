-- 003 — Demo kit: demo codes, caller lookup for the shared demo numbers,
-- and live activity on the public demo page. Run after 002. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Demo code, e.g. SMILE-482: given to the owner with the demo kit so staff calling
-- from another number can still reach "their" clinic.
-- ---------------------------------------------------------------------------
alter table public.clinics add column if not exists demo_code text;
create unique index if not exists clinics_demo_code_key on public.clinics (demo_code);

create or replace function public.new_demo_code(p_name text)
returns text language plpgsql volatile set search_path = '' as $$
declare
  base text := upper(left(regexp_replace(coalesce(p_name, ''), '[^A-Za-z]', '', 'g'), 5));
  code text;
begin
  if length(base) < 3 then base := 'DEMO'; end if;
  loop
    code := base || '-' || lpad((floor(random() * 1000))::int::text, 3, '0');
    exit when not exists (select 1 from public.clinics where demo_code = code);
  end loop;
  return code;
end;
$$;

update public.clinics set demo_code = public.new_demo_code(name) where demo_code is null;

-- ---------------------------------------------------------------------------
-- create_demo: slugs now always end in a random part (the link works like a
-- private key for the public demo page), and the demo gets a demo code.
-- ---------------------------------------------------------------------------
create or replace function public.create_demo(p_clinic jsonb, p_lead jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  base text;
  s    text;
  cid  uuid;
  lid  uuid;
  code text;
begin
  base := left(trim(both '-' from regexp_replace(lower(coalesce(p_clinic ->> 'name', '')), '[^a-z0-9]+', '-', 'g')), 40);
  base := trim(both '-' from base);
  if base is null or length(base) < 3 then base := 'clinic'; end if;
  loop
    s := base || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
    exit when not exists (select 1 from public.clinics where slug = s);
  end loop;
  code := public.new_demo_code(p_clinic ->> 'name');

  insert into public.clinics (slug, name, status, config, demo_mode, retention_days, expires_at, demo_code)
  values (s, p_clinic ->> 'name', 'demo', coalesce(p_clinic -> 'config', '{}'::jsonb), true, 7, now() + interval '7 days', code)
  returning id into cid;

  insert into public.leads (clinic_id, contact_name, phone, email, clinic_name, clinic_type, city, website, source, message, status)
  values (cid, p_lead ->> 'contact_name', p_lead ->> 'phone', p_lead ->> 'email', p_clinic ->> 'name',
          p_lead ->> 'clinic_type', p_lead ->> 'city', p_lead ->> 'website',
          coalesce(nullif(p_lead ->> 'source', ''), 'website'), p_lead ->> 'message', 'new')
  returning id into lid;

  return jsonb_build_object('clinic_id', cid, 'slug', s, 'lead_id', lid, 'demo_code', code);
end;
$$;

revoke all on function public.create_demo(jsonb, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Which clinic should the shared demo receptionist / chatbot act as?
-- 1) demo code, if given  2) the caller's number matches a demo request
-- 3) fallback: the showcase clinic (elite-clinic-dubai). Service role only.
-- ---------------------------------------------------------------------------
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
    select l.id, l.slug, l.name, l.config, l.demo_code, 'code'::text as matched_by, 1 as rank, now() as at
    from live l, caller
    where caller.code <> '' and l.demo_code = caller.code
    union all
    select l.id, l.slug, l.name, l.config, l.demo_code, 'phone', 2, ld.created_at
    from public.leads ld
    join live l on l.id = ld.clinic_id, caller
    where length(caller.digits) >= 8
      and regexp_replace(coalesce(ld.phone, ''), '\D', '', 'g') = caller.digits
    union all
    select c.id, c.slug, c.name, c.config, c.demo_code, 'fallback', 3, c.created_at
    from public.clinics c
    where c.slug = 'elite-clinic-dubai'
  )
  select id, slug, name, config, demo_code, matched_by
  from candidates
  order by rank, at desc
  limit 1;
$$;

revoke all on function public.find_demo_clinic(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public demo page: also return the demo code, and the demo's real activity
-- (the owner's own test calls and chats), so they appear live on the page.
-- Only works with the exact (random) slug of an unexpired demo.
-- ---------------------------------------------------------------------------
drop function if exists public.get_demo(text);
create function public.get_demo(p_slug text)
returns table (id uuid, slug text, name text, config jsonb, demo_code text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.slug, c.name, c.config, c.demo_code
  from public.clinics c
  where c.slug = p_slug and c.status = 'demo' and (c.expires_at is null or c.expires_at > now());
$$;

create or replace function public.get_demo_activity(p_slug text)
returns setof public.activity
language sql stable security definer set search_path = '' as $$
  select a.*
  from public.activity a
  join public.clinics c on c.id = a.clinic_id
  where c.slug = p_slug and c.status = 'demo' and (c.expires_at is null or c.expires_at > now())
  order by a.created_at desc
  limit 300;
$$;

revoke all on function public.get_demo(text) from public;
revoke all on function public.get_demo_activity(text) from public;
grant execute on function public.get_demo(text) to anon, authenticated;
grant execute on function public.get_demo_activity(text) to anon, authenticated;
