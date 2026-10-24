-- AI Front Desk dashboard — run this whole file once in Supabase → SQL Editor.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- activity: one row per thing the AI front desk did (written by n8n)
-- ---------------------------------------------------------------------------
create table if not exists public.activity (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  channel          text not null check (channel in ('call', 'whatsapp', 'voice_note', 'web')),
  patient_name     text,
  phone_masked     text,
  language         text,
  summary          text,
  outcome          text not null check (outcome in ('booked', 'forwarded', 'info', 'cancelled')),
  duration_sec     integer check (duration_sec is null or duration_sec >= 0),
  recording_url    text,
  appointment_time timestamptz,
  doctor           text,
  -- Optional extras (have defaults, so n8n can ignore them):
  --   event:   'missed_call_recovered' / 'reminder' feed those two dashboard KPIs
  --   service: shown on the calendar block and sets its length
  event            text not null default 'conversation'
                   check (event in ('conversation', 'missed_call_recovered', 'reminder')),
  service          text
);

create index if not exists activity_created_at_idx on public.activity (created_at desc);
create index if not exists activity_appointment_time_idx on public.activity (appointment_time) where appointment_time is not null;

-- Phone numbers are masked inside the database, so a raw number sent by n8n is
-- never stored. "+971501234567" → "+971 50 *** 4567". Mirrors lib/phone.ts.
create or replace function public.mask_phone(p text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  d  text;
  cc text;
  codes text[] := array['971','966','974','973','968','965','962','961','92','91','90','49','44','41','39','34','33','31','20','7','1'];
  c  text;
  rest text;
begin
  if p is null or p = '' or position('*' in p) > 0 then
    return p;
  end if;
  d := regexp_replace(p, '\D', '', 'g');
  if left(d, 2) = '00' then d := substr(d, 3);
  elsif left(d, 1) = '0' then d := '971' || substr(d, 2);  -- local format (050…); change for non-UAE clinics
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
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.phone_masked := public.mask_phone(new.phone_masked);
  return new;
end;
$$;

drop trigger if exists activity_mask_phone on public.activity;
create trigger activity_mask_phone
  before insert or update of phone_masked on public.activity
  for each row execute function public.activity_mask_phone();

-- ---------------------------------------------------------------------------
-- settings: single row holding demo mode + the clinic config from the Settings page
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  id             integer primary key default 1 check (id = 1),
  demo_mode      boolean not null default true,
  retention_days integer not null default 7 check (retention_days in (3, 7)),
  clinic         jsonb,
  updated_at     timestamptz not null default now()
);

insert into public.settings (id) values (1) on conflict (id) do nothing;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
--   * Dashboard users = Supabase Auth users (create them in Authentication → Users,
--     and turn OFF "Allow new users to sign up").
--   * n8n writes with the service_role / secret key, which bypasses RLS.
--   * The anon key alone can read nothing.
-- ---------------------------------------------------------------------------
alter table public.activity enable row level security;
alter table public.settings enable row level security;

drop policy if exists "staff can read activity" on public.activity;
create policy "staff can read activity" on public.activity
  for select to authenticated using (true);

drop policy if exists "staff can read settings" on public.settings;
create policy "staff can read settings" on public.settings
  for select to authenticated using (true);

drop policy if exists "staff can update settings" on public.settings;
create policy "staff can update settings" on public.settings
  for update to authenticated using (id = 1) with check (id = 1);

-- ---------------------------------------------------------------------------
-- Realtime: push new activity rows and settings changes to the dashboard
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'activity') then
    alter publication supabase_realtime add table public.activity;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'settings') then
    alter publication supabase_realtime add table public.settings;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Demo mode clean-up: daily pg_cron job deletes activity older than retention_days
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;

create or replace function public.purge_old_activity()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.settings;
  deleted integer := 0;
begin
  select * into s from public.settings where id = 1;
  if s.demo_mode then
    delete from public.activity
    where created_at < now() - make_interval(days => s.retention_days);
    get diagnostics deleted = row_count;
  end if;
  return deleted;
end;
$$;

revoke all on function public.purge_old_activity() from public, anon, authenticated;

-- 03:00 UTC every day. Scheduling with the same name replaces the existing job.
select cron.schedule('purge-old-activity', '0 3 * * *', $$select public.purge_old_activity();$$);
