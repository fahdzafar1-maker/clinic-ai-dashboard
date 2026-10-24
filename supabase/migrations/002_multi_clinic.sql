-- 002 — Multi-clinic (one database for demos, trials and paying clinics) + instant demos.
-- Run once in Supabase → SQL Editor after 001_initial.sql. Safe to re-run.

-- ---------------------------------------------------------------------------
-- clinics: one row per clinic (demo, trial or paying)
-- ---------------------------------------------------------------------------
create table if not exists public.clinics (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'),
  name           text not null check (char_length(name) between 2 and 120),
  status         text not null default 'demo' check (status in ('demo', 'trial', 'active', 'paused', 'expired')),
  config         jsonb not null default '{}'::jsonb,   -- ClinicConfig from the Settings page
  demo_mode      boolean not null default true,
  retention_days integer not null default 7 check (retention_days in (3, 7)),
  expires_at     timestamptz,                          -- demo: created + 7 days; trial: start + 7 days
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- (re-run safety for databases created with an earlier draft of this file)
alter table public.clinics add column if not exists expires_at timestamptz;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'clinics' and column_name = 'trial_ends_at') then
    update public.clinics set expires_at = coalesce(expires_at, trial_ends_at);
    alter table public.clinics drop column trial_ends_at;
  end if;
end;
$$;

drop trigger if exists clinics_touch on public.clinics;
create trigger clinics_touch before update on public.clinics
  for each row execute function public.touch_updated_at();

-- Who can see which clinic.
create table if not exists public.clinic_members (
  clinic_id  uuid not null references public.clinics (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (clinic_id, user_id)
);
create index if not exists clinic_members_user_idx on public.clinic_members (user_id);

-- Fahd / agency staff: see every clinic and every lead.
create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Demo requests and sales pipeline (agency-only; contains the lead's own contact details).
create table if not exists public.leads (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  clinic_id       uuid references public.clinics (id) on delete set null,
  contact_name    text,
  phone           text,
  email           text,
  clinic_name     text,
  clinic_type     text,
  city            text,
  website         text,
  source          text not null default 'website'
                  check (source in ('website', 'whatsapp', 'instagram', 'facebook', 'client_hunter', 'manual', 'other')),
  message         text,
  status          text not null default 'new'
                  check (status in ('new', 'demo_sent', 'contacted', 'trial', 'won', 'lost')),
  demo_views      integer not null default 0,
  first_viewed_at timestamptz,
  last_viewed_at  timestamptz
);
create index if not exists leads_created_at_idx on public.leads (created_at desc);

-- ---------------------------------------------------------------------------
-- activity belongs to a clinic
-- ---------------------------------------------------------------------------
alter table public.activity add column if not exists clinic_id uuid references public.clinics (id) on delete cascade;
create index if not exists activity_clinic_created_idx on public.activity (clinic_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Move the single-clinic setup from 001 into the first clinic row.
-- Everyone who already has a login (only the agency owner at this point)
-- becomes owner of that clinic and a platform admin.
-- ---------------------------------------------------------------------------
do $$
declare
  cid uuid;
begin
  if to_regclass('public.settings') is not null then
    insert into public.clinics (slug, name, status, config, demo_mode, retention_days)
    select 'elite-clinic-dubai',
           coalesce(nullif(s.clinic ->> 'name', ''), 'Elite Clinic Dubai'),
           'active',
           coalesce(s.clinic, '{}'::jsonb),
           s.demo_mode,
           s.retention_days
    from public.settings s
    where s.id = 1
    on conflict (slug) do nothing;

    select id into cid from public.clinics where slug = 'elite-clinic-dubai';
    update public.activity set clinic_id = cid where clinic_id is null;
    insert into public.clinic_members (clinic_id, user_id, role)
      select cid, u.id, 'owner' from auth.users u on conflict do nothing;
    insert into public.platform_admins (user_id)
      select u.id from auth.users u on conflict do nothing;

    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'settings') then
      alter publication supabase_realtime drop table public.settings;
    end if;
    drop table public.settings;
  end if;
end;
$$;

alter table public.activity alter column clinic_id set not null;

-- ---------------------------------------------------------------------------
-- Phone masking for any country: local numbers (0…) use the clinic's own
-- calling code from clinics.config.countryCode (default 971).
-- ---------------------------------------------------------------------------
create or replace function public.mask_phone(p text, local_code text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  d     text;
  cc    text;
  codes text[] := array['212','213','216','218','234','254','255','256','351','352','353','354','355','356','357','358','359','370','371','372','373','374','375','376','377','380','381','382','385','386','387','389','420','421','880','960','961','962','963','964','965','966','967','968','970','971','972','973','974','975','976','977','992','993','994','995','996','998','20','27','30','31','32','33','34','36','39','40','41','43','44','45','46','47','48','49','51','52','53','54','55','56','57','58','60','61','62','63','64','65','66','81','82','84','86','90','91','92','93','94','95','98','1','7'];
  c     text;
  rest  text;
begin
  if p is null or p = '' or position('*' in p) > 0 then
    return p;
  end if;
  d := regexp_replace(p, '\D', '', 'g');
  if left(d, 2) = '00' then d := substr(d, 3);
  elsif left(d, 1) = '0' then d := coalesce(nullif(local_code, ''), '971') || substr(d, 2);
  end if;
  if length(d) < 7 then return '***'; end if;
  cc := left(d, 3);
  foreach c in array codes loop
    if left(d, length(c)) = c then cc := c; exit; end if;
  end loop;
  rest := substr(d, length(cc) + 1);
  return '+' || cc || ' ' || left(rest, 2) || ' *** ' || right(rest, 4);
end;
$$;

create or replace function public.activity_mask_phone()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.phone_masked := public.mask_phone(
    new.phone_masked,
    (select regexp_replace(coalesce(c.config ->> 'countryCode', ''), '\D', '', 'g') from public.clinics c where c.id = new.clinic_id)
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access helpers (security definer so policies don't recurse)
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

create or replace function public.is_clinic_member(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin()
      or exists (select 1 from public.clinic_members where clinic_id = cid and user_id = auth.uid());
$$;

create or replace function public.is_clinic_owner(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin()
      or exists (select 1 from public.clinic_members where clinic_id = cid and user_id = auth.uid() and role = 'owner');
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.clinics enable row level security;
alter table public.clinic_members enable row level security;
alter table public.platform_admins enable row level security;
alter table public.leads enable row level security;

drop policy if exists "members read clinic" on public.clinics;
create policy "members read clinic" on public.clinics
  for select to authenticated using (public.is_clinic_member(id));

drop policy if exists "owners update clinic" on public.clinics;
create policy "owners update clinic" on public.clinics
  for update to authenticated using (public.is_clinic_owner(id)) with check (public.is_clinic_owner(id));

-- Owners may change their settings, but not their own status or expiry date.
revoke update on public.clinics from authenticated;
grant update (name, config, demo_mode, retention_days) on public.clinics to authenticated;

drop policy if exists "read own memberships" on public.clinic_members;
create policy "read own memberships" on public.clinic_members
  for select to authenticated using (user_id = auth.uid() or public.is_platform_admin());

drop policy if exists "read own admin row" on public.platform_admins;
create policy "read own admin row" on public.platform_admins
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "admins read leads" on public.leads;
create policy "admins read leads" on public.leads
  for select to authenticated using (public.is_platform_admin());

drop policy if exists "admins update leads" on public.leads;
create policy "admins update leads" on public.leads
  for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists "staff can read activity" on public.activity;
drop policy if exists "members read activity" on public.activity;
create policy "members read activity" on public.activity
  for select to authenticated using (public.is_clinic_member(clinic_id));

-- ---------------------------------------------------------------------------
-- Public demo access: only these two functions are callable without login,
-- and they only expose clinics whose status is 'demo' and that haven't expired (7 days).
-- ---------------------------------------------------------------------------
create or replace function public.get_demo(p_slug text)
returns table (id uuid, slug text, name text, config jsonb)
language sql stable security definer set search_path = '' as $$
  select c.id, c.slug, c.name, c.config
  from public.clinics c
  where c.slug = p_slug and c.status = 'demo' and (c.expires_at is null or c.expires_at > now());
$$;

create or replace function public.track_demo_view(p_slug text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.leads l
  set demo_views = l.demo_views + 1,
      first_viewed_at = coalesce(l.first_viewed_at, now()),
      last_viewed_at = now()
  from public.clinics c
  where c.slug = p_slug and c.status = 'demo' and l.clinic_id = c.id;
end;
$$;

revoke all on function public.get_demo(text) from public;
revoke all on function public.track_demo_view(text) from public;
grant execute on function public.get_demo(text) to anon, authenticated;
grant execute on function public.track_demo_view(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_demo: called by the DEMO-01 n8n workflow with the service key.
-- Builds a unique slug from the clinic name, creates the demo clinic and the lead.
-- ---------------------------------------------------------------------------
create or replace function public.create_demo(p_clinic jsonb, p_lead jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  base text;
  s    text;
  cid  uuid;
  lid  uuid;
begin
  base := left(trim(both '-' from regexp_replace(lower(coalesce(p_clinic ->> 'name', '')), '[^a-z0-9]+', '-', 'g')), 40);
  base := trim(both '-' from base);
  if base is null or length(base) < 3 then base := 'clinic'; end if;
  s := base;
  while exists (select 1 from public.clinics where slug = s) loop
    s := base || '-' || substr(md5(random()::text), 1, 4);
  end loop;

  insert into public.clinics (slug, name, status, config, demo_mode, retention_days, expires_at)
  values (s, p_clinic ->> 'name', 'demo', coalesce(p_clinic -> 'config', '{}'::jsonb), true, 7, now() + interval '7 days')
  returning id into cid;

  insert into public.leads (clinic_id, contact_name, phone, email, clinic_name, clinic_type, city, website, source, message, status)
  values (cid, p_lead ->> 'contact_name', p_lead ->> 'phone', p_lead ->> 'email', p_clinic ->> 'name',
          p_lead ->> 'clinic_type', p_lead ->> 'city', p_lead ->> 'website',
          coalesce(nullif(p_lead ->> 'source', ''), 'website'), p_lead ->> 'message', 'new')
  returning id into lid;

  return jsonb_build_object('clinic_id', cid, 'slug', s, 'lead_id', lid);
end;
$$;

revoke all on function public.create_demo(jsonb, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'clinics') then
    alter publication supabase_realtime add table public.clinics;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'leads') then
    alter publication supabase_realtime add table public.leads;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Daily job: per-clinic demo-mode clean-up + expire finished demos and trials.
-- (Same cron job name as 001, so this replaces the old function body.)
-- ---------------------------------------------------------------------------
create or replace function public.purge_old_activity()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  deleted integer := 0;
begin
  delete from public.activity a
  using public.clinics c
  where a.clinic_id = c.id
    and c.demo_mode
    and a.created_at < now() - make_interval(days => c.retention_days);
  get diagnostics deleted = row_count;

  update public.clinics set status = 'expired'
  where status in ('demo', 'trial') and expires_at is not null and expires_at < now();

  return deleted;
end;
$$;

revoke all on function public.purge_old_activity() from public, anon, authenticated;
select cron.schedule('purge-old-activity', '0 3 * * *', $$select public.purge_old_activity();$$);
