-- Row-level security. See docs/IMPLEMENTATION_PLAN.md §3.1.
--
-- The user-scoped Supabase client (roles anon/authenticated) is bound by these
-- policies. The service-role client bypasses RLS and is only used by cron jobs,
-- token links, admin pages and src/server code.

-- ---------------------------------------------------------------------------
-- Helpers. security definer so policies can consult users/team_members
-- without recursing into their own RLS.
-- ---------------------------------------------------------------------------

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select u.is_admin from public.users u where u.id = auth.uid()), false);
$$;

create function public.is_organizer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select u.is_organizer from public.users u where u.id = auth.uid()), false);
$$;

create function public.is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members tm
    where tm.team_id = p_team_id and tm.user_id = auth.uid()
  );
$$;

revoke execute on function public.is_admin(), public.is_organizer(), public.is_team_member(uuid)
  from public;
grant execute on function public.is_admin(), public.is_organizer(), public.is_team_member(uuid)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

alter table public.app_settings      enable row level security;
alter table public.users             enable row level security;
alter table public.profiles          enable row level security;
alter table public.events            enable row level security;
alter table public.event_interests   enable row level security;
alter table public.ideas             enable row level security;
alter table public.match_runs        enable row level security;
alter table public.matches           enable row level security;
alter table public.match_event_votes enable row level security;
alter table public.teams             enable row level security;
alter table public.team_members      enable row level security;
alter table public.notification_log  enable row level security;
alter table public.analytics_events  enable row level security;

-- ---------------------------------------------------------------------------
-- Table privileges. Supabase grants everything to anon/authenticated by
-- default; narrow that so a missing policy is not the only line of defense.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Tables added by later migrations start with no anon/authenticated access;
-- each migration grants exactly what its policies need.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

grant select on public.app_settings to anon, authenticated;
grant select on public.events to anon, authenticated;

grant select on
  public.users, public.profiles, public.event_interests, public.ideas, public.matches,
  public.match_event_votes, public.teams, public.team_members, public.notification_log,
  public.match_runs, public.analytics_events
  to authenticated;

-- Users may edit only these columns of their own row (not is_admin,
-- is_organizer or cornell_email).
grant update (
  name, campus, role, intents, raw_bio, github_url, linkedin_url, linkedin_text,
  notify_channel, phone_e164, paused_until, onboarding_started_at, onboarded_at, last_active_at
) on public.users to authenticated;

-- Users may edit their own tags; derived fields (embedding, extraction
-- metadata) are written by server code.
grant update (summary, skills, stack, domains, experience_level, user_edited)
  on public.profiles to authenticated;

grant insert (
  owner_id, event_id, raw_text, pitch, domain, skills_needed, scope, clarifying_question, status
) on public.ideas to authenticated;
grant update (
  event_id, raw_text, pitch, domain, skills_needed, scope, clarifying_question, status
) on public.ideas to authenticated;
grant delete on public.ideas to authenticated;

grant insert, update, delete on public.events to authenticated;
grant insert, delete on public.event_interests to authenticated;
grant insert, delete on public.match_event_votes to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- app_settings: readable by everyone (the login form shows allowed domains).
create policy app_settings_select on public.app_settings
  for select to anon, authenticated using (true);

-- users
create policy users_select_own_or_admin on public.users
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy users_update_own on public.users
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- profiles
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- events: public; organizers manage their own, admins manage all.
create policy events_select_all on public.events
  for select to anon, authenticated using (true);

create policy events_insert_organizer on public.events
  for insert to authenticated
  with check (
    (select public.is_admin())
    or ((select public.is_organizer()) and organizer_id = (select auth.uid()))
  );

create policy events_update_organizer on public.events
  for update to authenticated
  using (organizer_id = (select auth.uid()) or (select public.is_admin()))
  with check (organizer_id = (select auth.uid()) or (select public.is_admin()));

create policy events_delete_organizer on public.events
  for delete to authenticated
  using (organizer_id = (select auth.uid()) or (select public.is_admin()));

-- event_interests: own rows; organizers see interest in their events.
create policy event_interests_select on public.event_interests
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_admin())
    or exists (
      select 1 from public.events e
      where e.id = event_interests.event_id and e.organizer_id = (select auth.uid())
    )
  );

create policy event_interests_insert_own on public.event_interests
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy event_interests_delete_own on public.event_interests
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ideas: owner sees everything; a revealed match unlocks the full idea.
-- The public board reads ideas through public_board_ideas(), never directly.
create policy ideas_select_owner_or_revealed on public.ideas
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.matches m
      where m.idea_id = ideas.id
        and m.revealed_at is not null
        and (select auth.uid()) in (m.user_a, m.user_b)
    )
  );

create policy ideas_insert_own on public.ideas
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy ideas_update_own on public.ideas
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy ideas_delete_own on public.ideas
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- matches: members only. All writes go through server code.
create policy matches_select_member on public.matches
  for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));

-- match_event_votes: members of the match see votes; vote only for yourself
-- on a revealed match you are in.
create policy match_event_votes_select on public.match_event_votes
  for select to authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_event_votes.match_id and (select auth.uid()) in (m.user_a, m.user_b)
    )
  );

create policy match_event_votes_insert_own on public.match_event_votes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.matches m
      where m.id = match_event_votes.match_id
        and m.revealed_at is not null
        and (select auth.uid()) in (m.user_a, m.user_b)
    )
  );

create policy match_event_votes_delete_own on public.match_event_votes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- teams / team_members: visible to members. Writes go through server code.
create policy teams_select_member on public.teams
  for select to authenticated
  using ((select public.is_team_member(id)));

create policy team_members_select_member on public.team_members
  for select to authenticated
  using ((select public.is_team_member(team_id)));

-- Operational tables: admins read; server code writes.
create policy notification_log_select_admin on public.notification_log
  for select to authenticated using ((select public.is_admin()));

create policy match_runs_select_admin on public.match_runs
  for select to authenticated using ((select public.is_admin()));

create policy analytics_events_select_admin on public.analytics_events
  for select to authenticated using ((select public.is_admin()));
