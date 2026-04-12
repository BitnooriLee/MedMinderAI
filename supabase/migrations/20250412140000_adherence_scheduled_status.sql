-- Allow future "planned" dose rows for smart scheduling (status was only taken|missed).
alter table public.adherence_logs
drop constraint if exists adherence_logs_status_check;

alter table public.adherence_logs
add constraint adherence_logs_status_check
check (status in ('taken', 'missed', 'scheduled'));

comment on table public.adherence_logs is
  'Adherence events; timestamps stored as timestamptz (UTC). status=scheduled = planned dose not yet acted on.';

-- Idempotent inserts per medication instant (server upsert).
create unique index if not exists adherence_logs_med_scheduled_time_uniq
on public.adherence_logs (medication_id, scheduled_time);
