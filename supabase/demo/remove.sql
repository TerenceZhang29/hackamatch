-- Removes every demo profile and everything it owns (ideas, interests, matches, teams).
delete from auth.users where id in (select id from public.users where is_demo);
