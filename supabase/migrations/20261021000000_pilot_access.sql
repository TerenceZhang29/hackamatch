-- A temporary gate for the production pilot (docs/plans/pilot-access.md):
-- while app_settings.pilot_only is on, only netIDs on public.pilot_access can
-- create an account. People who already have one keep signing in.

alter table public.app_settings
  add column pilot_only boolean not null default false;

create table public.pilot_access (
  -- Stored lowercase, as Cornell netIDs are; compared with lower() below.
  netid    text primary key check (netid ~ '^[a-z0-9-]{2,40}$'),
  added_at timestamptz not null default now()
);

alter table public.pilot_access enable row level security;
-- No policies and no grants: only the service role (which bypasses RLS) uses it.
revoke all on public.pilot_access from anon, authenticated;

-- The authoritative check: a sign-up through Supabase Auth inserts the
-- public.users row inside its own transaction, so raising here aborts it,
-- whatever client sent the request. Only on insert: existing accounts and
-- email changes are untouched. The demo seed is exempt.
create function public.enforce_pilot_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('hackamatch.demo_seed', true) = 'on' then
    return new;
  end if;
  if (select s.pilot_only from public.app_settings s)
     and not exists (
       select 1 from public.pilot_access p
       where p.netid = lower(split_part(new.cornell_email::text, '@', 1))
     ) then
    raise exception 'Not on the pilot list'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger users_enforce_pilot_access
  before insert on public.users
  for each row execute function public.enforce_pilot_access();

-- For the login form, before any email is sent: may this address sign in?
-- True when the gate is off, when the address already has an account, or when
-- its netID is on the list. Server-only, so nobody can probe the list.
create function public.pilot_can_sign_in(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not (select s.pilot_only from public.app_settings s)
    or exists (select 1 from public.users u where lower(u.cornell_email::text) = lower(p_email))
    or exists (
      select 1 from public.pilot_access p
      where p.netid = lower(split_part(p_email, '@', 1))
    );
$$;

revoke execute on function public.pilot_can_sign_in(text) from public, anon, authenticated;
grant execute on function public.pilot_can_sign_in(text) to service_role;
revoke execute on function public.enforce_pilot_access() from public, anon, authenticated;
