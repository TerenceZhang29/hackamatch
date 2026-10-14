# Runbook: import the Phase 0 spreadsheets

Moves the people, ideas and hand-made matches from Phase 0 (the sign-up form and the matching sheet) into HackaMatch. Nobody is emailed during the import; welcome links are a separate, deliberate step.

## 1. Export the sheets

Save them under `data/phase0/` (gitignored; it holds student emails):

| File | Header row |
| --- | --- |
| `signups.csv` | `email,name,role,intents,sentence,github_url,linkedin_url,events,submitted_at` |
| `seed_ideas.csv` | `owner_email,sentence,event` |
| `matches.csv` | `email_a,email_b,idea_sentence,reason,a_response,b_response,teamed_up,event` |

Accepted values:

- `role`: `I have an idea`, `I can build`, `Both` (or `idea`, `builder`, `both`).
- `intents`, `events`: separated by `;` (commas work too). Intents: `hackathon partner`, `side project`, `co-founder`. Events are matched by name or slug, ignoring case.
- `a_response`, `b_response`: `interested` / `1` / `yes`, `pass` / `2` / `no`, or empty for pending.
- `teamed_up`: `yes` to create a team (only for mutual matches).

## 2. Point the script at the right project

The script reads `.env.local`. For production, use the production Supabase URL and service-role key, and the real LLM and embeddings providers so tags and vectors are real (`LLM_PROVIDER`, `EMBEDDINGS_PROVIDER` and their keys). Double-check before running: the import writes to whatever `NEXT_PUBLIC_SUPABASE_URL` points at.

Create every event named in the sheets first, in `/admin/events`. The dry run lists names it can't find.

## 3. Dry run

```bash
pnpm import:phase0 --signups data/phase0/signups.csv \
  --ideas data/phase0/seed_ideas.csv \
  --matches data/phase0/matches.csv --dry-run
```

It prints one line per change it would make, any rows it can't read (with spreadsheet line numbers), and unknown events. Nothing is written.

## 4. Import

Run the same command without `--dry-run`. For each sign-up it creates the account (no email sent), infers tags, creates the idea for idea people, tags events, puts the user in the pool and embeds them. Seed ideas become featured ideas owned by `owner_email`, or by the first admin (or `--admin-email`) when that address has no account. Matches keep their answers; both-interested matches are revealed, and `teamed_up = yes` creates the team.

Re-running is safe: existing users, ideas (same owner and text) and pairs are skipped. The exit code is non-zero if any row had an error; fix the sheet and re-run.

## 5. Welcome emails (optional, after checking the import)

```bash
pnpm import:phase0 --send-welcome --signups data/phase0/signups.csv --dry-run   # count only
pnpm import:phase0 --send-welcome --signups data/phase0/signups.csv
```

Sends each imported address a sign-in link (Supabase's magic-link email) that lands on `/me`, one per second. Addresses without an account are skipped.

## Local development data

`pnpm db:reset && pnpm seed:dev` adds 60 generated users (`dev-001@cornell.edu` …) through the same importer, using the fake LLM and embedder, and embeds the users from `supabase/seed.sql`. It refuses to run against a non-local Supabase. Run `pnpm db:reset` again before `pnpm test:db`, which expects only `seed.sql` data.
