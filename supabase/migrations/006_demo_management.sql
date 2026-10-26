-- 006 — Demo management for running 3–4 prospect demos at a time.
--   * admin_demo_action(): agency admins can extend a demo or end it now (owners can't change status/expiry).
--   * Daily job also deletes demos 3 days after they expire (calls, bookings, settings).
--     The lead row stays (clinic_id becomes NULL) so the sales history is kept.
-- Run after 005. Safe to re-run.

create or replace function public.admin_demo_action(p_clinic uuid, p_action text, p_days integer default 7)
returns table (id uuid, status text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only agency admins can manage demos';
  end if;

  if p_action = 'extend' then
    return query
    update public.clinics c
    set expires_at = greatest(coalesce(c.expires_at, now()), now()) + make_interval(days => least(greatest(coalesce(p_days, 7), 1), 30)),
        status = case when c.status = 'expired' then 'demo' else c.status end
    where c.id = p_clinic and c.status in ('demo', 'trial', 'expired')
    returning c.id, c.status, c.expires_at;
  elsif p_action = 'end' then
    return query
    update public.clinics c
    set status = 'expired', expires_at = now()
    where c.id = p_clinic and c.status in ('demo', 'trial')
    returning c.id, c.status, c.expires_at;
  else
    raise exception 'Unknown action %', p_action;
  end if;
end;
$$;

revoke all on function public.admin_demo_action(uuid, text, integer) from public, anon;
grant execute on function public.admin_demo_action(uuid, text, integer) to authenticated;

-- Daily job (same cron name as before): demo-mode clean-up, expire finished demos/trials,
-- and delete demo clinics 3 days after they expired.
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

  -- Expired prospect demos (nobody logs in to them) are removed with all their data.
  delete from public.clinics c
  where c.status = 'expired'
    and c.slug <> 'elite-clinic-dubai'
    and c.expires_at < now() - interval '3 days'
    and not exists (select 1 from public.clinic_members m where m.clinic_id = c.id);

  return deleted;
end;
$$;

revoke all on function public.purge_old_activity() from public, anon, authenticated;
select cron.schedule('purge-old-activity', '0 3 * * *', $$select public.purge_old_activity();$$);
