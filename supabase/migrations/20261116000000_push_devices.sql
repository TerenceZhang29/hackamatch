-- Push notifications for the iOS app (docs/plans/ios-app.md, phase 5).
--
-- push_devices: one row per phone that allowed notifications, keyed by its
--   APNs device token. A phone signed in to a new account moves to it.
--   `environment` says which APNs server the token belongs to: sandbox for
--   builds run from Xcode, production for TestFlight and the App Store.
-- Server-only, like the other notification tables.

create table public.push_devices (
  token       text primary key check (token ~ '^[0-9a-f]{64,200}$'),
  user_id     uuid not null references public.users (id) on delete cascade,
  environment text not null check (environment in ('sandbox', 'production')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index push_devices_user_id_idx on public.push_devices (user_id);

alter table public.push_devices enable row level security;
-- No policies and no grants: only the server (service role) reads and writes it.
revoke all on public.push_devices from anon, authenticated;

-- Pushes are logged in notification_log like emails, with their own channel.
-- (Members never pick it: notify_channel on users stays email or none.)
alter type public.notify_channel add value if not exists 'push';
