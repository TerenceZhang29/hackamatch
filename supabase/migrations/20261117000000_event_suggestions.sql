-- Hackathons found by the weekly discovery job (docs/plans/event-discovery.md).
-- The job only suggests: an admin reviews each one in /admin/events, and
-- nothing shows in the app or on the site until they save it as an event.
--
-- Server-only, like reports: no policies and no grants.

create table public.event_suggestions (
  id          uuid primary key default gen_random_uuid(),
  source      text not null check (source in ('mlh', 'devpost', 'luma')),
  name        text not null check (char_length(name) between 1 and 200),
  start_date  date not null,
  end_date    date not null,
  url         text not null check (url ~ '^https://' and char_length(url) <= 500),
  -- The link without scheme, "www.", query or trailing slash: one suggestion per page.
  url_key     text not null unique check (char_length(url_key) between 1 and 500),
  venue       text check (char_length(venue) <= 200),
  format      public.event_format,
  -- Event-form values: drafted from the event's own page when it could be
  -- read (page_read), else only what the source's list gives, or null.
  draft       jsonb,
  page_read   boolean not null default false,
  status      text not null default 'new' check (status in ('new', 'approved', 'dismissed')),
  event_id    uuid references public.events (id) on delete set null,
  found_at    timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.users (id) on delete set null,
  constraint event_suggestions_dates check (end_date >= start_date)
);
create index event_suggestions_new_idx on public.event_suggestions (start_date)
  where status = 'new';

alter table public.event_suggestions enable row level security;
revoke all on public.event_suggestions from anon, authenticated;

-- Admins get one email per run that finds something, logged like every email.
alter table public.notification_log drop constraint notification_log_kind_check;
alter table public.notification_log add constraint notification_log_kind_check check (kind in (
  'digest', 'curated_digest', 'weekly', 'inbound_interest', 'mutual', 'event_nudge', 'report',
  'event_suggestions'
));
