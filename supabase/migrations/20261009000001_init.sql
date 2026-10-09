-- HackaMatch initial schema. See docs/IMPLEMENTATION_PLAN.md §3.
-- Append-only: never edit this file after it is merged; add a new migration.

create extension if not exists vector with schema extensions;
create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.user_role        as enum ('idea', 'builder', 'both');
create type public.user_intent      as enum ('hackathon', 'side_project', 'cofounder');
create type public.notify_channel   as enum ('email', 'sms', 'slack', 'none');
create type public.experience_level as enum ('beginner', 'intermediate', 'advanced');
create type public.idea_scope       as enum ('weekend', 'few_weeks', 'ongoing');
create type public.idea_status      as enum ('open', 'filled', 'archived');
create type public.match_response   as enum ('pending', 'interested', 'pass');
create type public.match_source     as enum ('admin', 'board', 'nightly', 'curated');

-- ---------------------------------------------------------------------------
-- App settings (single row). Values here can change without a deploy.
-- ---------------------------------------------------------------------------

create table public.app_settings (
  id                     boolean primary key default true check (id),
  allowed_email_domains  text[] not null default '{cornell.edu}',
  updated_at             timestamptz not null default now()
);
insert into public.app_settings (id) values (true);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per auth user, created by the on_auth_user_created trigger. Only
-- cornell_email is required at creation; role is required to finish onboarding.
create table public.users (
  id                    uuid primary key references auth.users (id) on delete cascade,
  cornell_email         extensions.citext not null unique,
  name                  text,
  campus                text not null default 'cornell_tech',
  role                  public.user_role,
  intents               public.user_intent[] not null default '{}',
  raw_bio               text,
  github_url            text,
  linkedin_url          text,
  linkedin_text         text,
  notify_channel        public.notify_channel not null default 'email',
  phone_e164            text,
  is_admin              boolean not null default false,
  is_organizer          boolean not null default false,
  paused_until          timestamptz,
  onboarding_started_at timestamptz,
  onboarded_at          timestamptz,
  last_active_at        timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Derived by the LLM; the user may edit tags (user_edited = true stops overwrites).
create table public.profiles (
  user_id          uuid primary key references public.users (id) on delete cascade,
  summary          text,
  skills           text[] not null default '{}',
  stack            text[] not null default '{}',
  domains          text[] not null default '{}',
  experience_level public.experience_level,
  embedding        extensions.vector(1024),
  user_edited      boolean not null default false,
  extraction_model text,
  extracted_at     timestamptz,
  embedded_at      timestamptz
);

create table public.events (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name          text not null,
  description   text,
  url           text,
  start_date    date not null,
  end_date      date not null,
  team_size_min int  not null default 2 check (team_size_min >= 1),
  team_size_max int  not null default 4,
  organizer_id  uuid references public.users (id) on delete set null,
  nudge_sent_at timestamptz,
  created_at    timestamptz not null default now(),
  check (end_date >= start_date),
  check (team_size_max >= team_size_min)
);

create table public.event_interests (
  user_id    uuid references public.users (id) on delete cascade,
  event_id   uuid references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create table public.ideas (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.users (id) on delete cascade,
  event_id            uuid references public.events (id) on delete set null,
  raw_text            text not null,  -- private: owner + revealed matches only
  pitch               text,           -- public short pitch, LLM-written
  domain              text,
  skills_needed       text[] not null default '{}',
  scope               public.idea_scope,
  clarifying_question text,
  embedding           extensions.vector(1024),
  status              public.idea_status not null default 'open',
  featured            boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.match_runs (
  id          uuid primary key default gen_random_uuid(),
  run_date    date not null unique,
  mode        text not null check (mode in ('algorithm', 'cold_start')),
  status      text not null default 'running'
              check (status in ('running', 'scored', 'reasoned', 'sent', 'failed')),
  weights     jsonb not null,
  stats       jsonb not null default '{}',
  error       text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);

-- One row per unordered pair, ever. user_a < user_b canonically.
create table public.matches (
  id              uuid primary key default gen_random_uuid(),
  user_a          uuid not null references public.users (id) on delete cascade,
  user_b          uuid not null references public.users (id) on delete cascade,
  idea_id         uuid references public.ideas (id) on delete set null,
  event_id        uuid references public.events (id) on delete set null,
  source          public.match_source not null,
  run_id          uuid references public.match_runs (id) on delete set null,
  score           real,
  score_breakdown jsonb,
  reason_for_a    text,
  reason_for_b    text,
  a_response      public.match_response not null default 'pending',
  b_response      public.match_response not null default 'pending',
  a_responded_at  timestamptz,
  b_responded_at  timestamptz,
  revealed_at     timestamptz,
  teamed_up_at    timestamptz,
  created_at      timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);

create table public.match_event_votes (
  match_id   uuid references public.matches (id) on delete cascade,
  user_id    uuid references public.users (id) on delete cascade,
  event_id   uuid references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, user_id, event_id)
);

create table public.teams (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid references public.events (id) on delete set null,
  idea_id    uuid references public.ideas (id) on delete set null,
  match_id   uuid references public.matches (id) on delete set null,
  created_by uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id   uuid references public.teams (id) on delete cascade,
  user_id   uuid references public.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table public.notification_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  channel     public.notify_channel not null,
  kind        text not null check (kind in (
                'digest', 'curated_digest', 'weekly', 'inbound_interest', 'mutual', 'event_nudge'
              )),
  local_date  date not null,
  payload     jsonb not null default '{}',
  provider_id text,
  status      text not null default 'sent' check (status in ('sent', 'failed', 'skipped')),
  created_at  timestamptz not null default now()
);
create unique index notification_one_digest_per_day
  on public.notification_log (user_id, local_date)
  where kind in ('digest', 'curated_digest', 'weekly');

create table public.analytics_events (
  id         bigserial primary key,
  user_id    uuid references public.users (id) on delete set null,
  name       text not null,
  props      jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index ideas_owner_id_idx on public.ideas (owner_id);
create index ideas_status_idx on public.ideas (status);
create index ideas_event_id_idx on public.ideas (event_id);
create index matches_user_a_idx on public.matches (user_a);
create index matches_user_b_idx on public.matches (user_b);
create index matches_run_id_idx on public.matches (run_id);
create index matches_idea_id_idx on public.matches (idea_id);
create index event_interests_event_id_idx on public.event_interests (event_id);
create index team_members_user_id_idx on public.team_members (user_id);
create index notification_log_user_date_idx on public.notification_log (user_id, local_date);
create index analytics_events_name_created_idx on public.analytics_events (name, created_at);
create index profiles_embedding_hnsw on public.profiles
  using hnsw (embedding extensions.vector_cosine_ops);
create index ideas_embedding_hnsw on public.ideas
  using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Keep updated_at current.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create trigger ideas_set_updated_at
  before update on public.ideas
  for each row execute function public.set_updated_at();

-- Only addresses on an allowed domain may have an account.
create function public.enforce_email_domain()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  domain text := lower(split_part(new.cornell_email::text, '@', 2));
begin
  if not exists (
    select 1 from public.app_settings s where domain = any (s.allowed_email_domains)
  ) then
    raise exception 'Email domain "%" is not allowed', domain
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger users_enforce_email_domain
  before insert or update of cornell_email on public.users
  for each row execute function public.enforce_email_domain();

-- Create the public.users and public.profiles rows for every new auth user.
-- Runs inside the auth insert, so a disallowed domain aborts the sign-up.
create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, cornell_email, name)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'name', ''));

  insert into public.profiles (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

-- Users who are in the matching pool right now. security_invoker keeps RLS.
create view public.active_pool
with (security_invoker = true)
as
select *
from public.users
where onboarded_at is not null
  and (paused_until is null or paused_until < now());
