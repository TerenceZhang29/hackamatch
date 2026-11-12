-- Report and block (docs/plans/ios-app.md, phase 2). The App Store requires
-- both for apps where people see each other's profiles; they are on the web too.
--
-- blocks: one person hiding another. It works both ways: neither sees the
--   other in the deck, on event pages or in matches, whoever blocked.
-- reports: one person flagging another for the admin, with a reason. A
--   report also blocks. Admins review them in /admin/reports.
--
-- Both are server-only: nobody can read who blocked or reported them.

create table public.blocks (
  blocker_id uuid not null references public.users (id) on delete cascade,
  blocked_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);
-- "Who has blocked me" is asked as often as "whom have I blocked".
create index blocks_blocked_id_idx on public.blocks (blocked_id);

create type public.report_reason as enum (
  'harassment', 'inappropriate', 'spam', 'fake', 'other'
);
create type public.report_status as enum ('open', 'resolved');

create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  -- Kept when the reporter deletes their account, so the admin still sees it.
  reporter_id uuid references public.users (id) on delete set null,
  reported_id uuid not null references public.users (id) on delete cascade,
  reason      public.report_reason not null,
  note        text check (char_length(note) <= 1000),
  status      public.report_status not null default 'open',
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.users (id) on delete set null,
  constraint reports_not_self check (reporter_id is distinct from reported_id)
);
create index reports_open_idx on public.reports (created_at) where status = 'open';
create index reports_reported_id_idx on public.reports (reported_id);

alter table public.blocks enable row level security;
alter table public.reports enable row level security;
-- No policies and no grants: only the server (service role) reads and writes them.
revoke all on public.blocks, public.reports from anon, authenticated;

-- Admins are emailed about each new report, logged like every other email.
alter table public.notification_log drop constraint notification_log_kind_check;
alter table public.notification_log add constraint notification_log_kind_check check (kind in (
  'digest', 'curated_digest', 'weekly', 'inbound_interest', 'mutual', 'event_nudge', 'report'
));

-- When the member agreed to the terms at sign-up. Null for accounts from
-- before the terms existed. Set by the server only (no column grant).
alter table public.users add column terms_accepted_at timestamptz;
