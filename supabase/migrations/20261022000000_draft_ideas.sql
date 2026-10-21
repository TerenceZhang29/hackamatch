-- Draft ideas (P1-22, docs/plans/p1-22-signup-routes.md): a builder whose
-- sign-up sentence describes an idea gets it saved as a draft, private to
-- them until they post it. Every public list already shows only 'open'
-- ideas; public_idea showed anything but 'archived', so it now names the
-- statuses it shows. (The new value can't be used in this transaction, which
-- is why the filter lists the public ones instead of excluding 'draft'.)

alter type public.idea_status add value if not exists 'draft';

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
    and i.status in ('open', 'filled')
    and u.onboarded_at is not null
    and (u.paused_until is null or u.paused_until < now())
    and (not u.is_demo or (select s.show_demo from public.app_settings s));
$$;
