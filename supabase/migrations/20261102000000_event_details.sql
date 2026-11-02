-- P1-25 (docs/plans/p1-25-event-details.md): the details people compare
-- hackathons on, and that recommendations will later match against.
--
-- Every column is nullable: null means "not known", and the event page hides
-- it, so existing events keep working. The list columns (prizes, tracks,
-- judging, schedule) are jsonb arrays whose shape src/lib/event-details.ts
-- checks on every write; here only the type and a size cap are enforced.
-- Events stay public to read and admin-only to write (RLS unchanged).

create type public.event_format as enum ('in_person', 'online', 'hybrid');
create type public.event_level as enum ('beginner', 'intermediate', 'advanced');
create type public.event_admission as enum ('open', 'application', 'first_come');

alter table public.events
  add column format             public.event_format,
  add column length_hours       int check (length_hours between 1 and 400),
  add column entry_fee_cents    int check (entry_fee_cents between 0 and 10000000),
  add column open_to            text check (char_length(open_to) <= 120),
  add column level              public.event_level,
  add column apply_by           date,
  add column apply_url          text check (char_length(apply_url) <= 2048),
  add column admission          public.event_admission,
  add column capacity           int check (capacity between 1 and 100000),
  add column prize_total_cents  int check (prize_total_cents between 0 and 1000000000),
  add column prizes             jsonb check (jsonb_typeof(prizes) = 'array' and jsonb_array_length(prizes) <= 12),
  add column tracks             jsonb check (jsonb_typeof(tracks) = 'array' and jsonb_array_length(tracks) <= 8),
  add column tools              text check (char_length(tools) <= 300),
  add column judging            jsonb check (jsonb_typeof(judging) = 'array' and jsonb_array_length(judging) <= 10),
  add column schedule           jsonb check (jsonb_typeof(schedule) = 'array' and jsonb_array_length(schedule) <= 30),
  add column perks              text[] not null default '{}'
    check (perks <@ array['meals', 'mentors', 'sleep', 'travel', 'workshops', 'swag']),
  add column perk_notes         text check (char_length(perk_notes) <= 300),
  add column chat_url           text check (char_length(chat_url) <= 2048),
  add column details_updated_at timestamptz;
