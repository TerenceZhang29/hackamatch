-- Local development seed. Applied by `pnpm db:reset` after the migrations.
-- Never run against production.
--
-- Embeddings are left null here; scripts/seed-dev.ts (P1-16) fills them with
-- the fake embedder once it exists (P1-05).
--
-- Every seeded account can sign in by magic link; the email lands in the local
-- mail catcher (Mailpit) at http://127.0.0.1:54324.

-- Creates an auth user (and, via on_auth_user_created, its users/profiles rows).
create function pg_temp.seed_auth_user(p_id uuid, p_email text, p_name text)
returns void
language sql
as $$
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email, '',
    now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('name', p_name),
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), p_id, p_id::text, 'email',
    jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
    now(), now(), now()
  );
$$;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

select pg_temp.seed_auth_user(id::uuid, email, name)
from (values
  ('00000000-0000-4000-a000-000000000001', 'admin@cornell.edu',  'HackaMatch Admin'),
  ('00000000-0000-4000-a000-000000000101', 'mp101@cornell.edu',  'Maya Patel'),
  ('00000000-0000-4000-a000-000000000102', 'jl102@cornell.edu',  'Jordan Lee'),
  ('00000000-0000-4000-a000-000000000103', 'ar103@cornell.edu',  'Amara Robinson'),
  ('00000000-0000-4000-a000-000000000104', 'dk104@cornell.edu',  'Daniel Kim'),
  ('00000000-0000-4000-a000-000000000201', 'sc201@cornell.edu',  'Sofia Chen'),
  ('00000000-0000-4000-a000-000000000202', 'ry202@cornell.edu',  'Ravi Yadav'),
  ('00000000-0000-4000-a000-000000000203', 'eg203@cornell.edu',  'Elena Garcia'),
  ('00000000-0000-4000-a000-000000000204', 'tn204@cornell.edu',  'Tom Nguyen'),
  ('00000000-0000-4000-a000-000000000205', 'pw205@cornell.edu',  'Priya Wang'),
  ('00000000-0000-4000-a000-000000000301', 'ob301@cornell.edu',  'Omar Bakr'),
  ('00000000-0000-4000-a000-000000000302', 'lh302@cornell.edu',  'Lena Hoffmann'),
  ('00000000-0000-4000-a000-000000000303', 'new303@cornell.edu', null)
) as seed_users (id, email, name);

update public.users set is_admin = true, is_organizer = true
where id = '00000000-0000-4000-a000-000000000001';

-- Onboarded users: role, intents, the one sentence, activity timestamps.
update public.users u
set role = s.role::public.user_role,
    intents = s.intents::public.user_intent[],
    raw_bio = s.raw_bio,
    github_url = s.github_url,
    onboarding_started_at = now() - interval '10 days',
    onboarded_at = now() - interval '10 days' + interval '45 seconds',
    last_active_at = now() - s.inactive_days * interval '1 day'
from (values
  ('00000000-0000-4000-a000-000000000101', 'idea',    '{hackathon,side_project}',
   'An app that lets nurses swap shifts without a manager in the loop.', null, 1),
  ('00000000-0000-4000-a000-000000000102', 'idea',    '{hackathon}',
   'A tool that turns lecture recordings into spaced-repetition flashcards.', null, 2),
  ('00000000-0000-4000-a000-000000000103', 'idea',    '{cofounder,side_project}',
   'A marketplace for NYC restaurants to sell surplus food at closing time.', null, 0),
  ('00000000-0000-4000-a000-000000000104', 'idea',    '{hackathon}',
   'A civic app that explains city council votes in plain language.', null, 12),
  ('00000000-0000-4000-a000-000000000201', 'builder', '{hackathon,side_project}',
   'I build React and Next.js apps and like health projects.',
   'https://github.com/sofia-chen-dev', 0),
  ('00000000-0000-4000-a000-000000000202', 'builder', '{hackathon,cofounder}',
   'ML engineer: PyTorch, recommendation systems, some backend in Python.', null, 1),
  ('00000000-0000-4000-a000-000000000203', 'builder', '{side_project}',
   'iOS developer, Swift and SwiftUI, shipped two apps to the App Store.', null, 3),
  ('00000000-0000-4000-a000-000000000204', 'builder', '{hackathon}',
   'Backend and data: Postgres, Go, and building APIs that scale.', null, 5),
  ('00000000-0000-4000-a000-000000000205', 'builder', '{hackathon,side_project}',
   'Product designer, Figma prototypes and user research.', null, 2),
  ('00000000-0000-4000-a000-000000000301', 'both',    '{hackathon,cofounder}',
   'Building a climate sensor dashboard; I can do the hardware and need a frontend dev.',
   null, 1),
  ('00000000-0000-4000-a000-000000000302', 'both',    '{side_project}',
   'Edtech idea for language practice; I can build the backend in Python.', null, 30)
) as s (id, role, intents, raw_bio, github_url, inactive_days)
where u.id = s.id::uuid;

-- Lena is paused; new303 signed up but never finished onboarding.
update public.users set paused_until = now() + interval '30 days'
where id = '00000000-0000-4000-a000-000000000302';
update public.users set onboarding_started_at = now() - interval '1 day'
where id = '00000000-0000-4000-a000-000000000303';

-- Inferred profiles (what the LLM would have extracted).
update public.profiles p
set summary = s.summary,
    skills = s.skills::text[],
    stack = s.stack::text[],
    domains = s.domains::text[],
    experience_level = s.level::public.experience_level,
    extraction_model = 'seed',
    extracted_at = now() - interval '10 days'
from (values
  ('00000000-0000-4000-a000-000000000101', 'MBA student building a shift-swapping app for nurses.',
   '{product-management}', '{}', '{health}', 'intermediate'),
  ('00000000-0000-4000-a000-000000000102', 'Policy student who wants better study tools.',
   '{}', '{}', '{edtech}', 'beginner'),
  ('00000000-0000-4000-a000-000000000103', 'Founder-minded MBA focused on food waste.',
   '{product-management,marketing}', '{}', '{climate,marketplaces}', 'intermediate'),
  ('00000000-0000-4000-a000-000000000104', 'Urban policy student interested in civic tech.',
   '{}', '{}', '{civic}', 'beginner'),
  ('00000000-0000-4000-a000-000000000201', 'Frontend engineer who builds React apps for health.',
   '{frontend}', '{react,nextjs,typescript}', '{health}', 'advanced'),
  ('00000000-0000-4000-a000-000000000202', 'ML engineer working on recommendation systems.',
   '{ml,backend}', '{python,pytorch}', '{}', 'advanced'),
  ('00000000-0000-4000-a000-000000000203', 'iOS developer with two shipped apps.',
   '{mobile}', '{swift,swiftui}', '{}', 'intermediate'),
  ('00000000-0000-4000-a000-000000000204', 'Backend engineer for APIs and data.',
   '{backend,data-engineering}', '{go,postgres}', '{}', 'intermediate'),
  ('00000000-0000-4000-a000-000000000205', 'Product designer who prototypes in Figma.',
   '{ux-design,user-research}', '{figma}', '{}', 'intermediate'),
  ('00000000-0000-4000-a000-000000000301', 'Hardware tinkerer building climate sensors.',
   '{hardware}', '{arduino,python}', '{climate}', 'intermediate'),
  ('00000000-0000-4000-a000-000000000302', 'Backend developer interested in language learning.',
   '{backend}', '{python}', '{edtech}', 'intermediate')
) as s (id, summary, skills, stack, domains, level)
where p.user_id = s.id::uuid;

-- ---------------------------------------------------------------------------
-- Events: one 3 weeks out, one 8 weeks out, one in the past.
-- ---------------------------------------------------------------------------

insert into public.events (
  id, slug, name, description, start_date, end_date, team_size_min, team_size_max, organizer_id
) values
  ('00000000-0000-4000-b000-000000000001', 'cornell-tech-fall-hack', 'Cornell Tech Fall Hack',
   'A 24-hour hackathon on Roosevelt Island.', current_date + 21, current_date + 22, 2, 4,
   '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-b000-000000000002', 'health-ai-buildathon', 'Health AI Buildathon',
   'A weekend building AI tools for clinicians.', current_date + 56, current_date + 57, 2, 5,
   '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-b000-000000000003', 'spring-startup-sprint', 'Spring Startup Sprint',
   'Last semester''s startup sprint.', current_date - 30, current_date - 29, 2, 4,
   '00000000-0000-4000-a000-000000000001');

insert into public.event_interests (user_id, event_id) values
  ('00000000-0000-4000-a000-000000000101', '00000000-0000-4000-b000-000000000001'),
  ('00000000-0000-4000-a000-000000000101', '00000000-0000-4000-b000-000000000002'),
  ('00000000-0000-4000-a000-000000000102', '00000000-0000-4000-b000-000000000001'),
  ('00000000-0000-4000-a000-000000000201', '00000000-0000-4000-b000-000000000001'),
  ('00000000-0000-4000-a000-000000000201', '00000000-0000-4000-b000-000000000002'),
  ('00000000-0000-4000-a000-000000000202', '00000000-0000-4000-b000-000000000002'),
  ('00000000-0000-4000-a000-000000000204', '00000000-0000-4000-b000-000000000001'),
  ('00000000-0000-4000-a000-000000000301', '00000000-0000-4000-b000-000000000001');

-- ---------------------------------------------------------------------------
-- Ideas: five open, one filled.
-- ---------------------------------------------------------------------------

insert into public.ideas (
  id, owner_id, event_id, raw_text, pitch, domain, skills_needed, scope, status, featured
) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101',
   '00000000-0000-4000-b000-000000000001',
   'An app that lets nurses swap shifts without a manager in the loop. Hospitals approve rules once and swaps that follow them go through automatically.',
   'Let nurses swap shifts in minutes instead of days.', 'health',
   '{frontend,mobile,backend}', 'weekend', 'open', true),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000102',
   '00000000-0000-4000-b000-000000000001',
   'A tool that turns lecture recordings into spaced-repetition flashcards using transcripts and an LLM.',
   'Turn lecture recordings into flashcards automatically.', 'edtech',
   '{ml,frontend}', 'weekend', 'open', false),
  ('00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000103', null,
   'A marketplace for NYC restaurants to sell surplus food at closing time, with pickup windows and dynamic pricing.',
   'Help restaurants sell surplus food before closing.', 'climate',
   '{mobile,backend,ux-design}', 'ongoing', 'open', false),
  ('00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000104', null,
   'A civic app that explains city council votes in plain language and lets residents follow topics.',
   'Explain city council votes in plain language.', 'civic',
   '{frontend,data-engineering}', 'few_weeks', 'open', false),
  ('00000000-0000-4000-c000-000000000005', '00000000-0000-4000-a000-000000000301',
   '00000000-0000-4000-b000-000000000001',
   'A dashboard for low-cost air-quality sensors placed around campus, with alerts when readings spike.',
   'A live air-quality map from cheap campus sensors.', 'climate',
   '{frontend,data-analysis}', 'weekend', 'open', false),
  ('00000000-0000-4000-c000-000000000006', '00000000-0000-4000-a000-000000000101', null,
   'A scheduling assistant for hospital volunteers.',
   'Scheduling for hospital volunteers.', 'health',
   '{backend}', 'few_weeks', 'filled', false);
