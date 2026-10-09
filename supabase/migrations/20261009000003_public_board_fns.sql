-- Public board functions. See docs/IMPLEMENTATION_PLAN.md §3.1.
--
-- Logged-out visitors (role anon) cannot read users, profiles or ideas
-- directly. These security definer functions expose only the safe columns:
-- never emails, links, or an idea's full raw_text.

-- "Maya Patel" -> "Maya P."; a single name stays as is; no name -> generic label.
create function public.display_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name is null or btrim(p_name) = '' then 'Cornell student'
    when array_length(regexp_split_to_array(btrim(p_name), '\s+'), 1) = 1 then btrim(p_name)
    else split_part(btrim(p_name), ' ', 1) || ' '
      || upper(left((regexp_split_to_array(btrim(p_name), '\s+'))[
           array_length(regexp_split_to_array(btrim(p_name), '\s+'), 1)
         ], 1)) || '.'
  end;
$$;

-- Open ideas from users who are in the pool, featured first then newest.
create function public.public_board_ideas(
  p_limit int default 20,
  p_offset int default 0,
  p_event_slug text default null
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
  order by i.featured desc, i.created_at desc, i.id
  limit least(greatest(coalesce(p_limit, 20), 0), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- People in the pool. p_role 'builder' or 'idea' also includes 'both', since a
-- "both" user fits either side.
create function public.public_board_people(
  p_limit int default 20,
  p_offset int default 0,
  p_role public.user_role default null
)
returns table (
  user_id          uuid,
  display_name     text,
  role             public.user_role,
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
    u.id, public.display_name(u.name), u.role, p.summary, p.skills, p.stack, p.domains,
    p.experience_level
  from public.users u
  join public.profiles p on p.user_id = u.id
  where u.onboarded_at is not null
    and u.role is not null
    and (u.paused_until is null or u.paused_until < now())
    and (p_role is null or u.role = p_role or u.role = 'both')
  order by u.onboarded_at desc, u.id
  limit least(greatest(coalesce(p_limit, 20), 0), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function
  public.display_name(text),
  public.public_board_ideas(int, int, text),
  public.public_board_people(int, int, public.user_role)
  from public;

grant execute on function
  public.display_name(text),
  public.public_board_ideas(int, int, text),
  public.public_board_people(int, int, public.user_role)
  to anon, authenticated, service_role;
