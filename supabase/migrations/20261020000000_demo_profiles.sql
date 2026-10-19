-- Demo profiles for a production pilot (docs/plans/demo-profiles.md).
--
-- users.is_demo marks hand-written demo people (demo-NNN@hackamatch.invalid):
-- they never receive or trigger email, are labeled "Demo" in the app and are
-- left out of metrics. app_settings.show_demo hides all of them, and their
-- ideas, from the board functions at once.

alter table public.users add column is_demo boolean not null default false;
alter table public.app_settings add column show_demo boolean not null default true;

-- Same signatures and columns as before; only the demo filter is new.
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
  order by i.featured desc, i.created_at desc, i.id
  limit least(greatest(coalesce(p_limit, 20), 0), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

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
    and (not u.is_demo or (select s.show_demo from public.app_settings s))
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

create or replace function public.public_person(p_id uuid)
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
    and (u.paused_until is null or u.paused_until < now())
    and (not u.is_demo or (select s.show_demo from public.app_settings s));
$$;

create or replace function public.public_idea(p_id uuid)
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
    and (u.paused_until is null or u.paused_until < now())
    and (not u.is_demo or (select s.show_demo from public.app_settings s));
$$;

-- Demo accounts use the reserved hackamatch.invalid domain. It is allowed only
-- inside the demo seed's own transaction (`set local hackamatch.demo_seed =
-- 'on'`), which sign-ups through Supabase Auth can never set.
create or replace function public.enforce_email_domain()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  domain text := lower(split_part(new.cornell_email::text, '@', 2));
begin
  if domain = 'hackamatch.invalid' and current_setting('hackamatch.demo_seed', true) = 'on' then
    return new;
  end if;
  if not exists (
    select 1 from public.app_settings s where domain = any (s.allowed_email_domains)
  ) then
    raise exception 'Email domain "%" is not allowed', domain
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Demo accounts have no email in auth.users, so Supabase Auth can never find
-- one to send a sign-in link to (a banned account with an email still gets
-- one). Their address lives only in public.users, taken from the metadata,
-- and only inside the demo seed's transaction.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, cornell_email, name)
  values (
    new.id,
    coalesce(
      new.email,
      case
        when current_setting('hackamatch.demo_seed', true) = 'on'
          then new.raw_user_meta_data ->> 'demo_email'
      end
    ),
    nullif(new.raw_user_meta_data ->> 'name', '')
  );

  insert into public.profiles (user_id) values (new.id);
  return new;
end;
$$;

-- The active pool (metrics, and later automatic matching) never includes demo
-- profiles. `select *` now also returns is_demo, appended at the end.
create or replace view public.active_pool
with (security_invoker = true)
as
select *
from public.users
where onboarded_at is not null
  and (paused_until is null or paused_until < now())
  and not is_demo;
