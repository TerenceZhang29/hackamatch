-- P1-25 (docs/plans/p1-25-event-details.md): "Who's going" numbers for the
-- events list and the event page. "Going" counts the event's pool as
-- countEventInterest does (onboarded, not paused, not left the pool);
-- "need a team" is the part of it not on a team for that event yet.
-- Counts only, never who: server only, like the board functions.

create function public.event_going_stats(p_event_ids uuid[])
returns table (event_id uuid, going int, need_team int)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ei.event_id,
    count(*)::int,
    count(*) filter (
      where not exists (
        select 1 from public.team_members tm
        join public.teams t on t.id = tm.team_id
        where tm.user_id = ei.user_id and t.event_id = ei.event_id
      )
    )::int
  from public.event_interests ei
  join public.users u on u.id = ei.user_id
  where ei.event_id = any (coalesce(p_event_ids, '{}'))
    and ei.left_pool_at is null
    and u.onboarded_at is not null
    and (u.paused_until is null or u.paused_until < now())
  group by ei.event_id;
$$;

-- The most common skills among the event's pool, most common first.
create function public.event_top_skills(p_event_id uuid, p_limit int default 4)
returns table (skill text, people int)
language sql
stable
security definer
set search_path = ''
as $$
  select s.skill, count(distinct ei.user_id)::int
  from public.event_interests ei
  join public.users u on u.id = ei.user_id
  join public.profiles p on p.user_id = ei.user_id
  cross join lateral unnest(p.skills) as s(skill)
  where ei.event_id = p_event_id
    and ei.left_pool_at is null
    and u.onboarded_at is not null
    and (u.paused_until is null or u.paused_until < now())
  group by s.skill
  order by 2 desc, 1
  limit least(greatest(coalesce(p_limit, 4), 0), 10);
$$;

revoke execute on function
  public.event_going_stats(uuid[]),
  public.event_top_skills(uuid, int)
  from public, anon, authenticated;
grant execute on function
  public.event_going_stats(uuid[]),
  public.event_top_skills(uuid, int)
  to service_role;
