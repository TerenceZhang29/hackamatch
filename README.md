# HackaMatch

Pairs Cornell students who have ideas with students who can build them.

- Product framework: [docs/FRAMEWORK.md](docs/FRAMEWORK.md)
- Implementation plan (phased, ticket-level): [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)

## Stack

Next.js 15 (App Router, TypeScript) · Tailwind CSS 4 · Supabase (Auth, Postgres + pgvector) · Claude API · Voyage embeddings · Resend · Vercel.

## Local setup

Prerequisites: Node 22+, [pnpm](https://pnpm.io/installation) 10 (`corepack enable` picks the pinned version), and, from P1-02 on, Docker plus the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started).

```bash
pnpm install
cp .env.example .env.local   # fill in Supabase keys from `supabase status` once P1-02 lands
pnpm db:start                # from P1-02: starts local Supabase in Docker
pnpm db:reset                # from P1-02: applies migrations and seed data
pnpm dev                     # http://localhost:3000
```

Outside production, the LLM, embeddings, and email providers default to `fake` implementations, so no API keys are needed for local development or tests.

## Scripts

| Script                                    | What it does                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm dev`                                | Start the dev server                                                       |
| `pnpm build` / `pnpm start`               | Production build / serve it                                                |
| `pnpm lint`                               | ESLint (fails on warnings)                                                 |
| `pnpm format` / `pnpm format:check`       | Prettier write / check                                                     |
| `pnpm typecheck`                          | Generate Next route types, then `tsc --noEmit`                             |
| `pnpm test`                               | Unit tests (Vitest)                                                        |
| `pnpm test:e2e`                           | End-to-end tests (Playwright; starts the app itself)                       |
| `pnpm db:start` / `db:reset` / `db:types` | Local Supabase, reset with migrations + seed, regenerate `src/types/db.ts` |

## Configuration

All environment variables are declared and validated in `src/lib/config.ts` and documented in `.env.example`. The server validates them at boot (`src/instrumentation.ts`), so a misconfigured deploy fails immediately.

## Conventions

- The service-role Supabase client bypasses row-level security. ESLint only allows importing it from `src/app/api/cron/**`, `src/app/r/**`, `src/app/admin/**`, `src/server/**`, `scripts/**`, and `tests/**`.
- Every ticket must pass `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, and `pnpm test` (see the Definition of Done in the implementation plan).
