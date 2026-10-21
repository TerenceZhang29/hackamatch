-- Separate idea and person cards (P1-23, docs/plans/p1-23-two-decks.md).
--
-- card_passes: a Pass on a deck or board card hides that one card, not the
-- person. Passing someone's person card still shows their ideas, and passing
-- an idea still shows the person. Interested still answers the pair through
-- respond_to_pair, as before.

create type public.card_kind as enum ('idea', 'person');

create table public.card_passes (
  user_id    uuid not null references public.users (id) on delete cascade,
  kind       public.card_kind not null,
  target_id  uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, target_id)
);

alter table public.card_passes enable row level security;
-- No policies and no grants: only the server (service role) reads and writes it.
revoke all on public.card_passes from anon, authenticated;

-- public_board_ideas gains the owner's id (idea cards show the owner's
-- hackathons; owner ids are already public through public_idea) and a list
-- of ideas to leave out (the viewer's passes). New arguments and columns
-- mean drop and create; the server-only grants are applied again below.
drop function public.public_board_ideas(int, int, text, text, text, public.user_intent, uuid[]);

create function public.public_board_ideas(
  p_limit int default 20,
  p_offset int default 0,
  p_event_slug text default null,
  p_domain text default null,
  p_skill text default null,
  p_intent public.user_intent default null,
  p_exclude_user_ids uuid[] default '{}',
  p_exclude_idea_ids uuid[] default '{}'
)
returns table (
  id            uuid,
  owner_id      uuid,
  pitch         text,
  domain        text,
  skills_needed text[],
  scope         public.idea_scope,
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
    i.id, i.owner_id, i.pitch, i.domain, i.skills_needed, i.scope, i.event_id, i.featured,
    i.created_at, public.display_name(u.name)
  from public.ideas i
  join public.users u on u.id = i.owner_id
  left join public.events e on e.id = i.event_id
  where i.status = 'open'
    and u.onboarded_at is not null
    and (u.paused_until is null or u.paused_until < now())
    and (not u.is_demo or (select s.show_demo from public.app_settings s))
    and (p_event_slug is null or e.slug = p_event_slug)
    -- On an event's list, leave out ideas whose owner has left that event's pool.
    and not (
      p_event_slug is not null
      and exists (
        select 1 from public.event_interests ei
        where ei.user_id = i.owner_id and ei.event_id = i.event_id and ei.left_pool_at is not null
      )
    )
    and (p_domain is null or i.domain = p_domain)
    and (p_skill is null or p_skill = any (i.skills_needed))
    and (p_intent is null or p_intent = any (u.intents))
    and not (i.owner_id = any (coalesce(p_exclude_user_ids, '{}')))
    and not (i.id = any (coalesce(p_exclude_idea_ids, '{}')))
  order by i.featured desc, i.created_at desc, i.id
  limit least(greatest(coalesce(p_limit, 20), 0), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function
  public.public_board_ideas(int, int, text, text, text, public.user_intent, uuid[], uuid[])
  from public, anon, authenticated;
grant execute on function
  public.public_board_ideas(int, int, text, text, text, public.user_intent, uuid[], uuid[])
  to service_role;
