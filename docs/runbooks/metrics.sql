-- HackaMatch pilot metrics. Read-only queries: paste one into the Supabase
-- SQL editor (production) or run it with psql (local). Each query sets its
-- inputs in a `params` block at the top; edit the values there.

-- ---------------------------------------------------------------------------
-- 1. Phase 1 gate: at least 10 teams at the pilot event.
-- ---------------------------------------------------------------------------
with params as (select 'replace-with-event-slug'::text as event_slug)
select
  e.slug,
  e.name,
  e.start_date,
  count(distinct t.id) as teams,
  count(distinct t.id) >= 10 as gate_passed
from public.events e
cross join params p
left join public.teams t on t.event_id = e.id
where e.slug = p.event_slug
group by e.id;

-- ---------------------------------------------------------------------------
-- 2. Phase 0 gate (run inside the app, docs/plans/phase0.md option C):
--    at least 40 sign-ups and at least 5 teams since Phase 0 started.
--    "Sign-up" means joined the pool (onboarded), not just requested a link.
-- ---------------------------------------------------------------------------
with params as (select '2026-01-01'::date as phase0_start)
select
  (select count(*) from public.users u, params p
    where u.onboarded_at >= p.phase0_start) as signups,
  (select count(*) from public.teams t, params p
    where t.created_at >= p.phase0_start) as teams,
  (select count(*) from public.users u, params p
    where u.onboarded_at >= p.phase0_start) >= 40
  and (select count(*) from public.teams t, params p
    where t.created_at >= p.phase0_start) >= 5 as gate_passed;

-- ---------------------------------------------------------------------------
-- 3. Sign-up funnel since a date: link requested -> link clicked -> joined.
--    `people` counts distinct signed-in users; link requests happen before
--    sign-in, so they have no user id and show 0 people.
-- ---------------------------------------------------------------------------
with params as (select '2026-01-01'::date as since)
select
  a.name,
  count(*) as events,
  count(distinct a.user_id) as people
from public.analytics_events a, params p
where a.created_at >= p.since
  and a.name in ('board_viewed', 'cta_clicked', 'magic_link_requested',
                 'magic_link_clicked', 'pool_joined', 'idea_posted')
group by a.name
order by array_position(
  array['board_viewed', 'cta_clicked', 'magic_link_requested',
        'magic_link_clicked', 'pool_joined', 'idea_posted'], a.name);

-- ---------------------------------------------------------------------------
-- 4. Matches by source: made, mutual (contact revealed), teamed up.
-- ---------------------------------------------------------------------------
select
  m.source,
  count(*) as matches,
  count(m.revealed_at) as mutual,
  count(m.teamed_up_at) as teamed_up,
  round(100.0 * count(m.revealed_at) / nullif(count(*), 0), 1) as mutual_pct
from public.matches m
group by m.source
order by m.source;

-- ---------------------------------------------------------------------------
-- 5. Balance of the active pool: idea people vs builders.
-- ---------------------------------------------------------------------------
select coalesce(u.role::text, '(none)') as role, count(*) as people
from public.active_pool u
group by u.role
order by people desc;
