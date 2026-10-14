-- P1-07: keep the GitHub import summary so later re-extraction and re-embedding
-- can use it, not just the onboarding request that fetched it. Written by
-- server code only: the update grant for authenticated users (see the RLS
-- migration) does not include it.
alter table public.profiles add column github_summary text;
