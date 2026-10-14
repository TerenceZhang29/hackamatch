-- P1-10: board filters and exclusions.
--
-- Replaces the board functions from 20261009000003 with versions that filter
-- by event, domain, skill and intent, and that leave out a caller-supplied
-- list of users (the viewer and the people they have already matched with).
-- The exclusion list only removes rows, so passing any ids reveals nothing.
-- Also adds public_person(id) for a single builder's public card.

drop function public.public_board_ideas(int, int, text);
drop function public.public_board_people(int, int, public.user_role);

create function public.public_board_ideas(
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
    and (p_domain is null or i.domain = p_domain)
    and (p_skill is null or p_skill = any (i.skills_needed))
    and (p_intent is null or p_intent = any (u.intents))
    and not (i.owner_id = any (coalesce(p_exclude_user_ids, '{}')))
  order by i.featured desc, i.created_at desc, i.id
  limit least(greatest(coalesce(p_limit, 20), 0), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- p_role 'builder' or 'idea' also includes 'both', since a "both" user fits
-- either side. p_event_slug keeps people who tagged that event.
create function public.public_board_people(
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
        where ei.user_id = u.id and e.slug = p_event_slug
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

-- One person's public card, or nothing when they are not in the pool.
create function public.public_person(p_id uuid)
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
  where u.id = p_id
    and u.onboarded_at is not null
    and u.role is not null
    and (u.paused_until is null or u.paused_until < now());
$$;

revoke execute on function
  public.public_board_ideas(int, int, text, text, text, public.user_intent, uuid[]),
  public.public_board_people(int, int, public.user_role, text, text, text, public.user_intent, uuid[]),
  public.public_person(uuid)
  from public;

grant execute on function
  public.public_board_ideas(int, int, text, text, text, public.user_intent, uuid[]),
  public.public_board_people(int, int, public.user_role, text, text, text, public.user_intent, uuid[]),
  public.public_person(uuid)
  to anon, authenticated, service_role;
