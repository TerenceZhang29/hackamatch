# HackaMatch

Pairs Cornell students who have ideas with students who can build them.

- Product framework: [docs/FRAMEWORK.md](docs/FRAMEWORK.md)
- Implementation plan (phased, ticket-level): [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)

## Stack

Next.js 15 (App Router, TypeScript) · Tailwind CSS 4 · Supabase (Auth, Postgres + pgvector) · Claude API · Voyage embeddings · Resend · Vercel.

## Local setup

Prerequisites: Node 22+, [pnpm](https://pnpm.io/installation) 10 (`corepack enable` picks the pinned version), and Docker (for the local Supabase stack; the Supabase CLI itself is a dev dependency).

```bash
pnpm install
pnpm db:start   # starts local Supabase in Docker, applies migrations and seed data
pnpm db:env     # writes .env.local with the local Supabase URL and keys
pnpm dev        # http://localhost:3000
```

Outside production, the LLM, embeddings, and email providers default to `fake` implementations, so no API keys are needed for local development or tests.

Local services once `pnpm db:start` is running:

| Service                             | URL                                                       |
| ----------------------------------- | --------------------------------------------------------- |
| Supabase API                        | http://127.0.0.1:54321                                    |
| Postgres                            | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Supabase Studio                     | http://127.0.0.1:54323                                    |
| Mailpit (catches magic-link emails) | http://127.0.0.1:54324                                    |

Seeded accounts (see `supabase/seed.sql`) include `admin@cornell.edu` (admin and organizer), idea people such as `mp101@cornell.edu`, and builders such as `sc201@cornell.edu`. Sign in with a magic link and open it from Mailpit.

## Scripts

| Script                              | What it does                                                           |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `pnpm dev`                          | Start the dev server                                                   |
| `pnpm build` / `pnpm start`         | Production build / serve it                                            |
| `pnpm lint`                         | ESLint (fails on warnings)                                             |
| `pnpm format` / `pnpm format:check` | Prettier write / check                                                 |
| `pnpm typecheck`                    | Generate Next route types, then `tsc --noEmit`                         |
| `pnpm test`                         | Unit tests (Vitest)                                                    |
| `pnpm test:db`                      | Database tests (schema, triggers, RLS) against local Supabase          |
| `pnpm test:e2e`                     | End-to-end tests (Playwright; starts the app itself)                   |
| `pnpm db:start`                     | Start local Supabase                                                   |
| `pnpm db:env`                       | Write `.env.local` from the running local Supabase                     |
| `pnpm db:reset`                     | Recreate the local database from migrations + seed                     |
| `pnpm db:types`                     | Regenerate `src/types/db.ts` from the local schema (commit the result) |

## Database

- Migrations live in `supabase/migrations/` and are append-only. Create one with `pnpm exec supabase migration new <name>`, then run `pnpm db:reset`, `pnpm db:types`, and `pnpm test:db`.
- Row-level security is on for every table. New tables get no `anon`/`authenticated` access until a migration grants it.
- Logged-out pages read the public board through the `public_board_ideas` and `public_board_people` SQL functions, which expose only safe columns.

## Sign-in

- Sign-in is by magic link at `/login`, limited to the email domains in the `app_settings` table (`cornell.edu` by default). Locally, open the link from Mailpit.
- The emailed link opens `/auth/confirm` on any device. That page signs the user in only when its button is pressed, so mail scanners that fetch the link can't use it up.
- The email templates live in `supabase/templates/` and are registered in `supabase/config.toml`. The hosted Supabase project needs the same two templates and `${APP_URL}/auth/confirm**` on its redirect allow-list.
- `src/middleware.ts` redirects signed-out visitors away from `/me`, `/matches`, `/ideas/new`, `/organizer` and `/admin`. Pages and server actions also call `requireUser()`, `requireOnboarded()`, `requireAdmin()` or `requireOrganizer()` from `src/lib/auth.ts`.
- `?next=` accepts same-site relative paths only (`sanitizeNext` in `src/lib/auth-helpers.ts`).

## Configuration

All environment variables are declared and validated in `src/lib/config.ts` and documented in `.env.example`. The server validates them at boot (`src/instrumentation.ts`), so a misconfigured deploy fails immediately.

## Conventions

- The service-role Supabase client bypasses row-level security. ESLint only allows importing it from `src/app/api/cron/**`, `src/app/r/**`, `src/app/admin/**`, `src/server/**`, `scripts/**`, `tests/**`, and `src/lib/analytics.ts`.
- Every ticket must pass `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, and `pnpm test` (see the Definition of Done in the implementation plan).
