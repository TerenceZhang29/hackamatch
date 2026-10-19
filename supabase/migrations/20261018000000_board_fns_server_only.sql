-- The public board functions are called only by the server (service role).
-- Granted to anon and authenticated, anyone holding the public API key could
-- call them directly and skip the page's limits (visitors see 3 cards per
-- event), so they become server-only like respond_to_pair and team_up.

revoke execute on function
  public.public_board_ideas(int, int, text, text, text, public.user_intent, uuid[]),
  public.public_board_people(int, int, public.user_role, text, text, text, public.user_intent, uuid[]),
  public.public_person(uuid),
  public.public_idea(uuid)
  from anon, authenticated;
