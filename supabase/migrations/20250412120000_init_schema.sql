-- MedMinder AI: core schema + RLS (Phase 1 Task 1)
-- PHI minimization: prescription images are not stored; only extracted text metadata in medications.

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  locale text not null default 'en',
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  constraint profiles_locale_check check (locale in ('en', 'ko', 'es'))
);

comment on table public.profiles is 'User preferences; id matches auth.users.id.';

create table public.medications (
  id uuid primary key default gen_random_uuid (),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  dosage text not null default '',
  frequency text not null default '',
  instructions text,
  created_at timestamptz not null default now ()
);

comment on table public.medications is 'Structured medication metadata only (no prescription images).';

create table public.adherence_logs (
  id uuid primary key default gen_random_uuid (),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  medication_id uuid not null references public.medications (id) on delete cascade,
  status text not null,
  scheduled_time timestamptz not null,
  taken_at timestamptz,
  created_at timestamptz not null default now (),
  constraint adherence_logs_status_check check (status in ('taken', 'missed'))
);

comment on table public.adherence_logs is 'Adherence events; timestamps stored as timestamptz (UTC canonical).';

-- -----------------------------------------------------------------------------
-- Consistency: medication must belong to the same profile as the log row
-- -----------------------------------------------------------------------------

create or replace function public.enforce_adherence_medication_profile ()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  med_profile uuid;
begin
  select m.profile_id
    into med_profile
  from public.medications m
  where m.id = new.medication_id;

  if med_profile is null then
    raise exception 'medication_id not found';
  end if;

  if med_profile <> new.profile_id then
    raise exception 'medication_id does not belong to profile_id';
  end if;

  return new;
end;
$$;

create trigger adherence_logs_enforce_medication_profile
before insert or update on public.adherence_logs
for each row
execute function public.enforce_adherence_medication_profile ();

-- -----------------------------------------------------------------------------
-- Auto-create profile on signup
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, locale, timezone)
  values (
    new.id,
    'en',
    coalesce(new.raw_user_meta_data ->> 'timezone', 'UTC')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user ();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- Note: profiles uses id = auth.uid(); other tables use profile_id = auth.uid().
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.medications enable row level security;
alter table public.adherence_logs enable row level security;

-- profiles
create policy "profiles_select_own"
on public.profiles for select
using (auth.uid() = id);

create policy "profiles_insert_own"
on public.profiles for insert
with check (auth.uid() = id);

create policy "profiles_update_own"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "profiles_delete_own"
on public.profiles for delete
using (auth.uid() = id);

-- medications
create policy "medications_select_own"
on public.medications for select
using (auth.uid() = profile_id);

create policy "medications_insert_own"
on public.medications for insert
with check (auth.uid() = profile_id);

create policy "medications_update_own"
on public.medications for update
using (auth.uid() = profile_id)
with check (auth.uid() = profile_id);

create policy "medications_delete_own"
on public.medications for delete
using (auth.uid() = profile_id);

-- adherence_logs
create policy "adherence_logs_select_own"
on public.adherence_logs for select
using (auth.uid() = profile_id);

create policy "adherence_logs_insert_own"
on public.adherence_logs for insert
with check (auth.uid() = profile_id);

create policy "adherence_logs_update_own"
on public.adherence_logs for update
using (auth.uid() = profile_id)
with check (auth.uid() = profile_id);

create policy "adherence_logs_delete_own"
on public.adherence_logs for delete
using (auth.uid() = profile_id);
