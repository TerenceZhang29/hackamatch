-- P1-09: one idea's public fields, for /ideas/[id] when the viewer is not the
-- owner. Like public_board_ideas, it never returns raw_text and hides ideas
-- whose owner is not in the pool. Archived ideas are hidden; filled ones are
-- shown (with their status) so shared links keep working.
create function public.public_idea(p_id uuid)
returns table (
  id            uuid,
  owner_id      uuid,
  pitch         text,
  domain        text,
  skills_needed text[],
  scope         public.idea_scope,
  status        public.idea_status,
  event_id      uuid,
  featured      boolean,
  created_at    timestamptz,
  owner_display text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.id, i.owner_id, i.pitch, i.domain, i.skills_needed, i.scope, i.status, i.event_id,
    i.featured, i.created_at, public.display_name(u.name)
  from public.ideas i
  join public.users u on u.id = i.owner_id
  where i.id = p_id
    and i.status <> 'archived'
    and u.onboarded_at is not null
    and (u.paused_until is null or u.paused_until < now());
$$;

revoke execute on function public.public_idea(uuid) from public;
grant execute on function public.public_idea(uuid) to anon, authenticated, service_role;
