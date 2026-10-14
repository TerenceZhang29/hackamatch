-- P1-18: fixed-window rate limits kept in Postgres, so they hold across
-- server instances. Server code only.

create table public.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (key, window_start)
);

alter table public.rate_limits enable row level security;
-- No policies and no grants: only the service role (which bypasses RLS) uses it.

-- Counts one hit for `p_key` in the current window of `p_window_seconds` and
-- returns whether the hit is within `p_max`. Old windows of the same key are
-- cleared as it goes, so the table stays small.
create function public.hit_rate_limit(p_key text, p_window_seconds int, p_max int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz :=
    to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  hits int;
begin
  delete from public.rate_limits r where r.key = p_key and r.window_start < v_window;

  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into hits;

  return hits <= p_max;
end;
$$;

revoke execute on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, int, int) to service_role;
