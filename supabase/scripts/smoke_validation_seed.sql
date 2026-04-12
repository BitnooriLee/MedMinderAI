-- =============================================================================
-- MedMinder AI: smoke / validation seed data
-- Run in Supabase SQL Editor (postgres) or: psql $DATABASE_URL -f ...
--
-- Prerequisites:
--   1) Replace PRIMARY_USER_ID and OTHER_USER_ID with real UUIDs from
--      Authentication → Users (both must exist in auth.users).
--   2) RLS is BYPASSED when you run as the database owner in the SQL Editor.
--      Cross-tenant checks must be done with the anon client + JWT, or by
--      impersonating `authenticated` (see "RLS spot-check" section below).
--
-- Schema note: adherence_logs.status allows 'taken' | 'missed' | 'scheduled'.
-- Planned doses use 'scheduled' with taken_at IS NULL until the user logs intake.
-- =============================================================================

begin;

do $$
declare
  primary_user_id constant uuid := '00000000-0000-0000-0000-000000000001'::uuid; -- REPLACE
  other_user_id constant uuid := '00000000-0000-0000-0000-000000000002'::uuid; -- REPLACE
  med_a uuid;
  med_b uuid;
begin
  if not exists (select 1 from auth.users where id = primary_user_id) then
    raise exception 'PRIMARY_USER_ID not found in auth.users; create the user in Dashboard → Authentication first.';
  end if;

  if not exists (select 1 from auth.users where id = other_user_id) then
    raise exception 'OTHER_USER_ID not found in auth.users; create a second user for RLS contrast tests.';
  end if;

  insert into public.profiles (id, locale, timezone)
  values (primary_user_id, 'ko', 'Asia/Seoul')
  on conflict (id) do update
  set
    locale = excluded.locale,
    timezone = excluded.timezone;

  insert into public.profiles (id, locale, timezone)
  values (other_user_id, 'en', 'America/Los_Angeles')
  on conflict (id) do update
  set
    locale = excluded.locale,
    timezone = excluded.timezone;

  delete from public.adherence_logs
  where profile_id = primary_user_id;

  delete from public.medications
  where profile_id = primary_user_id;

  insert into public.medications (profile_id, name, dosage, frequency, instructions)
  values (
    primary_user_id,
    'Aspirin',
    '100 mg',
    'Once daily',
    'Take with food'
  )
  returning id into med_a;

  insert into public.medications (profile_id, name, dosage, frequency, instructions)
  values (
    primary_user_id,
    'Metformin',
    '500 mg',
    'Twice daily',
    'Take with meals'
  )
  returning id into med_b;

  insert into public.adherence_logs (
    profile_id,
    medication_id,
    status,
    scheduled_time,
    taken_at
  )
  values (
    primary_user_id,
    med_a,
    'taken',
    timestamptz '2026-04-12 09:00:00+00',
    timestamptz '2026-04-12 09:07:00+00'
  ),
  (
    primary_user_id,
    med_b,
    'missed',
    timestamptz '2026-04-12 14:00:00+00',
    null
  );
end $$;

commit;

-- -----------------------------------------------------------------------------
-- RLS spot-check (optional; requires privileges to SET ROLE authenticated)
-- When JWT sub = OTHER_USER_ID, selecting PRIMARY user's medications must
-- return zero rows (RLS filters by auth.uid() = profile_id — not an error,
-- an empty result set).
--
-- 1) Impersonate the primary user — expect >= 2 medications:
--    perform set_config(
--      'request.jwt.claims',
--      format('{"sub":"%s","role":"authenticated"}', 'PRIMARY_USER_UUID')::text,
--      true
--    );
--    set local role authenticated;
--    select count(*) from public.medications;  -- expect 2 for seeded user only if filter... actually policies filter by profile_id = auth.uid(), so count is rows owned by user
--
--    reset role;
--
-- 2) Impersonate OTHER_USER_ID — querying primary user's rows via explicit
--    profile_id filter must still return 0 rows:
--    perform set_config(
--      'request.jwt.claims',
--      format('{"sub":"%s","role":"authenticated"}', 'OTHER_USER_UUID')::text,
--      true
--    );
--    set local role authenticated;
--    select * from public.medications
--    where profile_id = 'PRIMARY_USER_UUID'::uuid;  -- expect 0 rows
--
--    reset role;
--
-- If set_config / SET ROLE is restricted in your project, verify RLS with
-- the Supabase JS client using anon key + each user's access_token instead.
-- -----------------------------------------------------------------------------
