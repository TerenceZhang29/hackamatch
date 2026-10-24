-- P1-24 (docs/plans/p1-24-redesign.md), first migration.
--
-- pending_signups: sign-up asks for the email last, so the answers are kept
-- here, keyed by email, until the magic link is confirmed. /signup/finish
-- shows them back before anything is saved to a profile, because anyone can
-- type someone else's email.
--
-- Events gain the details the event page shows: a time line, venue, host and
-- area tags (the same `domains` slugs people pick at sign-up).

create table public.pending_signups (
  email      text primary key check (email = lower(email)),
  answers    jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '48 hours'
);

alter table public.pending_signups enable row level security;
-- No policies and no grants: only the server (service role) reads and writes it.
revoke all on public.pending_signups from anon, authenticated;

alter table public.events
  add column time_label text check (char_length(time_label) <= 60),
  add column venue      text check (char_length(venue) <= 120),
  add column host       text check (char_length(host) <= 120),
  add column domains    text[] not null default '{}';
