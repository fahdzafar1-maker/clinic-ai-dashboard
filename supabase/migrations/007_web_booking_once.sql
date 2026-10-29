-- 007 — A website-chat booking is stored only once.
--   The chat AI sometimes repeats "booked" when the patient says "yes" or "thanks" again.
--   The same clinic + appointment time + patient name from the web chat is rejected by the
--   database; DEMO-04's "Log Chat To Dashboard" continues on error, so the chat is not affected.
-- Run after 006. Safe to re-run.

-- Remove duplicates that already exist (keeps the first row of each booking).
delete from public.activity a
using public.activity b
where a.channel = 'web' and b.channel = 'web'
  and a.outcome = 'booked' and b.outcome = 'booked'
  and a.clinic_id = b.clinic_id
  and a.appointment_time = b.appointment_time
  and lower(coalesce(a.patient_name, '')) = lower(coalesce(b.patient_name, ''))
  and (a.created_at, a.id) > (b.created_at, b.id);

create unique index if not exists activity_web_booking_once
  on public.activity (clinic_id, appointment_time, lower(coalesce(patient_name, '')))
  where channel = 'web' and outcome = 'booked' and appointment_time is not null;
