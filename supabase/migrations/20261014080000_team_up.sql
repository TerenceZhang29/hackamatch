-- P1-13: "We teamed up" from a pair's shared page.
--
-- One team per match per event ("no event" counts as one event), so pressing
-- the button twice, or both people pressing it at once, never makes two teams.

create unique index teams_one_per_match_event
  on public.teams (match_id, coalesce(event_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where match_id is not null;

-- Creates (or finds) the team for a revealed match and event, adds both people,
-- and stamps the match. Returns the team id and whether this call created it.
-- Server code only: callers check that p_actor is in the match.
create function public.team_up(p_match uuid, p_event uuid, p_actor uuid)
returns table (team_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
  new_id uuid;
  existing uuid;
begin
  select * into m from public.matches where id = p_match;
  if m.id is null or m.revealed_at is null or p_actor not in (m.user_a, m.user_b) then
    raise exception 'Not a revealed match of this user' using errcode = 'check_violation';
  end if;

  insert into public.teams (event_id, idea_id, match_id, created_by)
  values (p_event, m.idea_id, m.id, p_actor)
  on conflict (match_id, coalesce(event_id, '00000000-0000-0000-0000-000000000000'::uuid))
    where match_id is not null
    do nothing
  returning id into new_id;

  if new_id is null then
    select t.id into existing from public.teams t
    where t.match_id = m.id and t.event_id is not distinct from p_event;
  end if;

  insert into public.team_members (team_id, user_id)
  values (coalesce(new_id, existing), m.user_a), (coalesce(new_id, existing), m.user_b)
  on conflict do nothing;

  update public.matches set teamed_up_at = coalesce(teamed_up_at, now()) where id = m.id;

  return query select coalesce(new_id, existing), new_id is not null;
end;
$$;

revoke execute on function public.team_up(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.team_up(uuid, uuid, uuid) to service_role;
