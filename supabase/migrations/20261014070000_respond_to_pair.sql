-- P1-11: one atomic "answer about this person" for the board.
--
-- Inserts the pair's match with the actor's answer, or updates only the
-- actor's side if the pair already has one, in a single statement, so two
-- people clicking Interested on each other at the same moment produce one
-- row. Server code only: not executable by anon or authenticated users.

create function public.respond_to_pair(
  p_actor uuid,
  p_target uuid,
  p_idea uuid,
  p_response public.match_response,
  p_source public.match_source
)
returns table (match_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  low uuid := least(p_actor, p_target);
  high uuid := greatest(p_actor, p_target);
  actor_is_a boolean := p_actor < p_target;
begin
  if p_actor = p_target then
    raise exception 'A user cannot match with themselves' using errcode = 'check_violation';
  end if;
  if p_response = 'pending' then
    raise exception 'An answer must be interested or pass' using errcode = 'check_violation';
  end if;

  return query
  insert into public.matches as m (
    user_a, user_b, idea_id, source, a_response, b_response, a_responded_at, b_responded_at
  )
  values (
    low,
    high,
    p_idea,
    p_source,
    case when actor_is_a then p_response else 'pending' end,
    case when actor_is_a then 'pending' else p_response end,
    case when actor_is_a then now() end,
    case when actor_is_a then null else now() end
  )
  on conflict (user_a, user_b) do update set
    a_response = case when actor_is_a then p_response else m.a_response end,
    a_responded_at = case when actor_is_a then now() else m.a_responded_at end,
    b_response = case when actor_is_a then m.b_response else p_response end,
    b_responded_at = case when actor_is_a then m.b_responded_at else now() end,
    idea_id = coalesce(m.idea_id, excluded.idea_id)
  returning m.id, (m.xmax = 0);
end;
$$;

-- How many people a user has said Interested to since local midnight.
create function public.interests_today(p_user uuid, p_timezone text)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.matches m
  where (m.user_a = p_user and m.a_response = 'interested'
         and m.a_responded_at >= (date_trunc('day', now() at time zone p_timezone) at time zone p_timezone))
     or (m.user_b = p_user and m.b_response = 'interested'
         and m.b_responded_at >= (date_trunc('day', now() at time zone p_timezone) at time zone p_timezone));
$$;

revoke execute on function
  public.respond_to_pair(uuid, uuid, uuid, public.match_response, public.match_source),
  public.interests_today(uuid, text)
  from public, anon, authenticated;
grant execute on function
  public.respond_to_pair(uuid, uuid, uuid, public.match_response, public.match_source),
  public.interests_today(uuid, text)
  to service_role;
