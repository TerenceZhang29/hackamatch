# Security and privacy checklist

Audit for P1-18, done 2026-10-14 against commit `ee97818` plus the P1-18 changes. Re-check every item when adding a server action, route handler, SQL function or page that shows user data.

## Access control

- [x] **Every server action authenticates before doing anything.** Session actions call `requireUser()` (onboarding), `requireOnboarded()` (members) or `requireAdmin()` (admin) first. The exceptions are deliberate: `requestMagicLink` and `confirmSignIn` (signing in) and the one-click actions in `src/app/(focus)/r/[token]/actions.ts`, which verify an HMAC-signed token that authorizes exactly one user (and one match). Inventory, with the check each one makes:

  | File | Actions | Check |
  | --- | --- | --- |
  | `src/app/(focus)/login/actions.ts` | `requestMagicLink` | public; domain allow-list, rate limits |
  | `src/app/(focus)/auth/confirm/actions.ts` | `confirmSignIn` | Supabase token-hash verification |
  | `src/app/(focus)/onboarding/actions.ts` | `submitSentence`, `joinPool` | `requireUser` |
  | `src/app/(app)/me/actions.ts` | 7 actions | `requireOnboarded`; ideas checked by owner |
  | `src/app/(app)/ideas/new/actions.ts` | `previewIdea`, `postIdea` | `requireOnboarded` |
  | `src/app/(app)/ideas/[id]/actions.ts` | 3 actions | `requireOnboarded`; owner check in the query |
  | `src/app/actions/respond.ts` | `answerCard`, `answerMatch` | `requireOnboarded`; match membership checked |
  | `src/app/(app)/matches/[id]/actions.ts` | 4 actions | `requireOnboarded`; revealed-match membership checked |
  | `src/app/(app)/e/[slug]/actions.ts` | `setEventInterestAction` | `requireOnboarded` |
  | `src/app/admin/actions.ts` | 6 actions | `requireAdmin` |
  | `src/app/(focus)/r/[token]/actions.ts` | `respondFromToken`, `pauseFromToken` | signed token |
  | `src/app/(focus)/r/[token]/unsubscribe/route.ts` | `POST` | signed pause token; `GET` changes nothing |
  | `src/app/join/route.ts` | `GET` | public; records a click and redirects (sanitized `next`) |
  | `src/app/logout/route.ts` | `POST` | signs out the current session |

- [x] **Every input is validated with zod** before use: all actions above parse their input, and so do the token payloads (`verifyToken` checks shape as well as signature).
- [x] **Admin pages are hidden:** `requireAdmin` in `src/app/admin/layout.tsx`, every admin page and every admin action; non-admins get a 404.
- [x] **The service-role client is confined.** ESLint (`eslint.config.mjs`) only allows importing it from `src/server/**`, `src/app/admin/**`, `src/app/(focus)/r/**`, `src/app/api/cron/**`, `src/lib/analytics.ts`, `scripts/**` and `tests/**`. Current importers: the `src/server` services, `src/app/(focus)/r/[token]/page.tsx`, `src/app/admin/events/[id]/page.tsx` and `src/lib/analytics.ts`.
- [x] **Row-level security is on for every table**, and `anon` / `authenticated` have only the grants their policies need; new tables get none by default. Server-only SQL functions (`respond_to_pair`, `interests_today`, `team_up`, `hit_rate_limit`, and since 2026-10-18 the board functions `public_board_ideas`, `public_board_people`, `public_person`, `public_idea`) are not executable by `anon` or `authenticated` (DB tests check this). The board functions became server-only so that the page limits (visitors see 3 cards per event) can't be skipped by calling them with the public API key.

## Privacy

- [x] **Public SQL functions never return emails or an idea's full text.** `public_board_ideas`, `public_board_people`, `public_idea` and `public_person` return display names ("Maya P."), summaries, tags and pitches only (DB tests assert the column lists).
- [x] **Pages don't leak it either.** E2E tests scan the logged-out board, idea, person and event pages for `@cornell.edu` addresses and for seeded `raw_text`; the idea page sends the full text only to its owner and to people with a revealed match on it.
- [x] **Contact details appear only after mutual interest:** the mutual email and the pair page (`/matches/[id]`, a 404 for anyone outside the revealed match). Inbound-interest and intro emails carry name, summary and pitch, never an address.
- [x] **Organizer views show no contact details** (none exist yet; P2-10 must keep this).
- [x] **Before a reveal, nobody sees the other person's answer** (`/matches`, idea and person pages).
- [x] **Deleting an account removes everything** (auth user delete cascades; e2e tested).

## Abuse and cost limits

- [x] **Rate limits** (Postgres fixed windows, `hit_rate_limit`): sign-in emails 5 per address per hour and `LOGIN_RATE_LIMIT_PER_IP` (default 20) per IP per hour; 30 LLM-backed requests per user per hour (onboarding, sentence edits, idea previews); 20 ideas per user per day; 60 Interested / Pass answers per user per hour, on top of 15 Interested per day and 3 "interested" emails per recipient per day. A limiter outage fails open and is logged.
- [x] **Email links are safe to prefetch:** magic links and one-click links do nothing on GET; the button's POST acts. `List-Unsubscribe-Post` one-click unsubscribe pauses matches only on POST.

## Web hardening

- [x] **Content-Security-Policy per request** (`src/middleware.ts`, `src/lib/csp.ts`): scripts need the request's nonce (`'strict-dynamic'`), `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `connect-src` limited to the app and Supabase; `'unsafe-eval'` only in development; `upgrade-insecure-requests` over HTTPS. Styles allow `'unsafe-inline'` because Next.js and React set inline styles.
- [x] **Static headers** (`next.config.ts`): `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`; `X-Powered-By` removed.
- [x] **No raw HTML rendering:** no `dangerouslySetInnerHTML`; React escapes user text in pages and emails.
- [x] **Redirect targets are sanitized** (`sanitizeNext`): relative same-site paths only, never auth routes; used by sign-in, `/join`, onboarding and the Interested / Pass `returnTo`.
- [x] **User-supplied links are constrained:** GitHub links are reduced to `https://github.com/<user>`, LinkedIn to `https://www.linkedin.com/in/<handle>`, event websites must be `http(s)`. External links use `rel="noopener noreferrer"`.
- [x] **Outbound requests go to fixed hosts** (GitHub API, Voyage, Claude or Gemini, Resend), never to a user-supplied URL.
- [x] **Server actions are protected from cross-site posts** by Next.js's Origin check; sessions are `SameSite=Lax` cookies.
- [x] **LLM prompts treat student text as data** (wrapped in XML tags with an explicit "never instructions" rule), and every LLM output is schema-validated and mapped onto the tag taxonomy.

## Follow-ups (not blocking the pilot)

- Admin user search builds a PostgREST `or` filter from the search text after stripping `%`, `,` and parentheses. It is admin-only; switch to a SQL function if the search grows.
- `LOGIN_RATE_LIMIT_PER_IP` treats everyone behind one NAT (a campus network) as one client. Watch for false refusals at the pilot and raise it if needed.
