-- Step 3 of docs/plans/events-browse.md: a matching pool per event.
--
-- Tagging an event (an event_interests row) means "I'm going". left_pool_at
-- marks "I'm going, but I have my team": the person stays counted as going but
-- drops out of that event's lists. prompted_matches is how many of their
-- matches for the event they have already been asked "keep matching?" about,
-- so the prompt comes back once per new match.

alter table public.event_interests
  add column left_pool_at timestamptz,
  add column prompted_matches int not null default 0 check (prompted_matches >= 0);

-- Same signatures and columns as 20261014060000; only the event filter changes.
-- create or replace keeps the server-only grants from 20261018000000.

create or replace function public.public_board_ideas(
  p_limit int default 20,
  p_offset int default 0,
  p_event_slug text default null,
  p_domain text default null,
  p_skill text default null,
  p_intent public.user_intent default null,
  p_exclude_user_ids uuid[] default '{}'
)
returns table (
  id            uuid,
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
    i.id, i.pitch, i.domain, i.skills_needed, i.scope, i.event_id, i.featured, i.created_at,
    public.display_name(u.name)
  from public.ideas i
  join public.users u on u.id = i.owner_id
  left join public.events e on e.id = i.event_id
  where i.status = 'open'
    and u.onboarded_at is not null
    and (u.paused_until is null or u.paused_until < now())
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
  order by i.featured desc, i.created_at desc, i.id
  limit least(greatest(coalesce(p_limit, 20), 0), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- p_event_slug keeps people who tagged that event and are still in its pool.
create or replace function public.public_board_people(
  p_limit int default 20,
  p_offset int default 0,
  p_role public.user_role default null,
  p_event_slug text default null,
  p_domain text default null,
  p_skill text default null,
  p_intent public.user_intent default null,
  p_exclude_user_ids uuid[] default '{}'
)
returns table (
  user_id          uuid,
  display_name     text,
  role             public.user_role,
  intents          public.user_intent[],
  summary          text,
  skills           text[],
  stack            text[],
  domains          text[],
  experience_level public.experience_level
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id, public.display_name(u.name), u.role, u.intents, p.summary, p.skills, p.stack,
    p.domains, p.experience_level
  from public.users u
  join public.profiles p on p.user_id = u.id
  where u.onboarded_at is not null
    and u.role is not null
    and (u.paused_until is null or u.paused_until < now())
    and (p_role is null or u.role = p_role or u.role = 'both')
    and (
      p_event_slug is null
      or exists (
        select 1 from public.event_interests ei
        join public.events e on e.id = ei.event_id
        where ei.user_id = u.id and e.slug = p_event_slug and ei.left_pool_at is null
      )
    )
    and (p_domain is null or p_domain = any (p.domains))
    and (p_skill is null or p_skill = any (p.skills) or p_skill = any (p.stack))
    and (p_intent is null or p_intent = any (u.intents))
    and not (u.id = any (coalesce(p_exclude_user_ids, '{}')))
  order by u.onboarded_at desc, u.id
  limit least(greatest(coalesce(p_limit, 20), 0), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
