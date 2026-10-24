-- P1-24 (docs/plans/p1-24-redesign.md), second migration. Runs only after the
-- code that stops using goals, roles and ideas is deployed.
--
-- - Goals (intents) are gone: the column and its type are dropped.
-- - Roles are gone from the product. The column stays (old rows keep their
--   value), but the board no longer requires or filters on one.
-- - The idea board and idea page functions are dropped. The ideas table and
--   its rows stay, unseen.

drop function public.public_board_ideas(
  int, int, text, text, text, public.user_intent, uuid[], uuid[]
);
drop function public.public_idea(uuid);
drop function public.public_board_people(
  int, int, public.user_role, text, text, text, public.user_intent, uuid[]
);
drop function public.public_person(uuid);

create function public.public_board_people(
  p_limit int default 20,
  p_offset int default 0,
  p_event_slug text default null,
  p_domain text default null,
  p_skill text default null,
  p_exclude_user_ids uuid[] default '{}'
)
returns table (
  user_id          uuid,
  display_name     text,
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
    u.id, public.display_name(u.name), p.summary, p.skills, p.stack, p.domains,
    p.experience_level
  from public.users u
  join public.profiles p on p.user_id = u.id
  where u.onboarded_at is not null
    and (u.paused_until is null or u.paused_until < now())
    and (not u.is_demo or (select s.show_demo from public.app_settings s))
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
    and not (u.id = any (coalesce(p_exclude_user_ids, '{}')))
  order by u.onboarded_at desc, u.id
  limit least(greatest(coalesce(p_limit, 20), 0), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create function public.public_person(p_id uuid)
returns table (
  user_id          uuid,
  display_name     text,
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
    u.id, public.display_name(u.name), p.summary, p.skills, p.stack, p.domains,
    p.experience_level
  from public.users u
  join public.profiles p on p.user_id = u.id
  where u.id = p_id
    and u.onboarded_at is not null
    and (u.paused_until is null or u.paused_until < now())
    and (not u.is_demo or (select s.show_demo from public.app_settings s));
$$;

-- Server only, as before (20261018000000_board_fns_server_only.sql).
revoke execute on function
  public.public_board_people(int, int, text, text, text, uuid[]),
  public.public_person(uuid)
  from public, anon, authenticated;
grant execute on function
  public.public_board_people(int, int, text, text, text, uuid[]),
  public.public_person(uuid)
  to service_role;

-- active_pool is `select *` from users, so it is rebuilt without the column.
drop view public.active_pool;
alter table public.users drop column intents;
drop type public.user_intent;

create view public.active_pool
with (security_invoker = true)
as
select *
from public.users
where onboarded_at is not null
  and (paused_until is null or paused_until < now())
  and not is_demo;
