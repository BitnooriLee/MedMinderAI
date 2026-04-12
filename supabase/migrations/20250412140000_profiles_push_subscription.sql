-- Web Push subscription (PushSubscription JSON) for server-triggered reminders.

alter table public.profiles
  add column if not exists push_subscription jsonb;

comment on column public.profiles.push_subscription is
  'Browser PushSubscription JSON (from subscription.toJSON()). Null when notifications are off.';
