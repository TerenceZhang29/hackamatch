-- An event's organizer may not use HackaMatch. Keep their email on the event,
-- and link organizer_id (which grants the organizer RLS rights) only when an
-- account with that email exists: now, or when they sign up later.
-- Nothing emails organizers; this is a contact record.

alter table public.events
  add column organizer_email text
  check (organizer_email is null or organizer_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

update public.events e
set organizer_email = u.cornell_email
from public.users u
where u.id = e.organizer_id and e.organizer_email is null;

-- Same as 20261020000000 (demo accounts), plus: a new user whose email is an
-- event's organizer email becomes that event's organizer.
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

  if new.email is not null then
    update public.events
    set organizer_id = new.id
    where organizer_id is null and lower(organizer_email) = lower(new.email);
  end if;
  return new;
end;
$$;
