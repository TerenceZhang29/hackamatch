# Plan: HackaMatch on iOS

Requested by the owner on 2026-11-11. Status: **approach chosen (native, 2026-11-11); nothing is built.** The owner now has a paid Apple Developer account.

## Approach
Build a **native SwiftUI app** in `ios/` in this repo. It talks to a new JSON API (`/api/v1/*`) on the existing Next.js app, so the matching rules, limits and privacy checks stay in one place (`src/server/**`). The website keeps running unchanged, and keeps the parts the app doesn't need: `/admin`, the logged-out pages, and the one-click email links.

Why native rather than wrapping the site:
- **Push is the point.** The framework's fifth pillar is "the notification is the product". A native app can put Interested and Pass on the notification itself.
- **The deck is the main screen**, and swiping feels right only when it's native.
- **App Review** often rejects apps that are a website in a wrapper (guideline 4.2).
- **The app is small:** four tabs plus sign-up. Admin stays on the web.

The cost is that every student-facing screen then exists twice, and app changes wait on App Review. The alternatives are at the end.

## What the code allows today
- **The app can't talk to Supabase directly.** Almost all logic runs in `src/server/**` with the service-role key, and the board functions were made server-only on purpose (2026-10-18). The phone must call our server.
- **There is one JSON route**, `/api/deck`. It needs the session cookie and a same-origin header, so the app can't use it. Everything else is server actions, which only a browser can call.
- **Sign-in is a link in an email**, confirmed by a button on `/auth/confirm`. A phone app needs a code to type, or a link that opens the app.
- **Missing, and required by App Review:**
  - reporting and blocking a person (guideline 1.2, user-generated content);
  - a privacy policy page and terms of use;
  - a way for a reviewer without a Cornell address to sign in.
- **Already there:** account deletion (`deleteMyAccount`), which Apple requires in the app; a design with tokens and a dark theme; fake providers for local work.
- **Sign in with Apple isn't required**, because sign-in is by email only (guideline 4.8 applies to third-party logins).

## Phases
Time estimates are rough and unchecked.

### 0. Apple setup (owner, about an hour)
- Register the bundle ID (suggested `com.hackamatch.app`) with Push Notifications and Associated Domains.
- Create the app record in App Store Connect.
- Create an APNs auth key (`.p8`). Keep it out of the repo; it goes into Vercel as environment variables.
- Send Claude the Team ID and the key ID.

### 1. Server: API and sign-in for the app (about 1 week, with phase 2)
No change for web users.
- **Bearer sign-in.** A `getApiUser(request)` next to `getUser()` in `src/lib/auth.ts` that reads `Authorization: Bearer <Supabase access token>`. No cookies, so no cross-site risk and no origin check.
- **Sign in with a 6-digit code.**
  - The email templates add `{{ .Token }}` under the link. Local `otp_length` is already 6.
  - `POST /api/v1/auth/request` reuses `sendMagicLink`, so the domain check, rate limits and pilot gate all apply.
  - `POST /api/v1/auth/verify` checks the code and returns the access and refresh tokens.
  - `POST /api/v1/auth/refresh` and `/auth/signout`. The app keeps tokens in the Keychain and needs no Supabase library.
- **Routes**, each a thin wrapper over an existing `src/server` function, with zod on the way in and out:

  | Route | Backs | Server code |
  |---|---|---|
  | `GET /me`, `PATCH /me`, `DELETE /me` | Me tab, pause, delete account | `profiles.ts` |
  | `POST /signup` | the four sign-up steps | `signup.ts` |
  | `GET /taxonomy` | areas and skills for the pickers | `src/lib/taxonomy` |
  | `GET /deck`, `POST /deck/answer`, `POST /deck/undo` | Discover | `deck.ts`, `matches.ts`, `card-passes.ts` |
  | `GET /people/:id` | full profile | `board.ts` |
  | `GET /events`, `GET /events/:slug`, `PUT /events/:id/going` | Events | `events.ts` |
  | `GET /matches`, `GET /matches/:id`, `POST /matches/:id/answer` | Matches and the pair page | `matches.ts` |
  | `POST /matches/:id/hackathons`, `POST /matches/:id/team` | pick a hackathon, "We teamed up" | `teams.ts` |
  | `PUT /devices`, `DELETE /devices/:token` | push tokens | new |
  | `POST /reports`, `PUT /blocks/:userId` | report and block | new |

- **One contract for both sides.** Response schemas live in `src/lib/api/`. The route tests write sample responses to `ios/Fixtures/*.json`, and the Swift tests decode those files, so a changed field fails a test on both sides.
- **Tests:** unit and database tests per route; add every route to the inventory in `docs/security.md`.

### 2. Server and web: what App Review requires
- **Report and block.**
  - Migration: `reports` (reporter, reported, reason, note, status) and `blocks` (blocker, blocked), both server-only.
  - A blocked pair never see each other in the deck, events or matches.
  - `/admin/reports` lists reports; a new report emails the admin. Apple expects action within 24 hours.
  - The same two actions go on the web person card.
- **`/privacy` and `/terms`** pages. The terms must say abusive content isn't tolerated, and sign-up must show agreement to them. The owner should read both before they go live.
- **Review account.** See Decisions.

### 3. App: skeleton, sign-in, Discover (about 1 week)
- `ios/HackaMatch.xcodeproj`: SwiftUI, iPhone only, no third-party packages (URLSession and Keychain).
- **Two configurations:** Debug talks to `http://localhost:3000` (local Supabase, fake providers, codes from Mailpit); Release talks to `https://hackamatch.com`.
- **Design:** the tokens from `globals.css` as an asset catalog with light and dark values; SF Symbols in place of lucide; the four tabs as a native tab bar.
- **Screens:** landing, sign-up (hackathons, areas, skills, name and email), enter code, then Discover with swipe, the hackathon filter, Undo and the full profile.
- Dynamic Type and VoiceOver labels from the start, with the same names as the web ("Pass", "Interested").

### 4. App: the other tabs (about 1 week)
- **Events:** the list, event details with the same section order, "I'm going!".
- **Matches:** the list with the waiting count, and the pair page: contact, the coffee-chat message with Copy and Share, picking a hackathon, "We teamed up".
- **Me:** name, tags, hackathons, pause, sign out, delete account (typed "delete", as on the web).
- Report and Block on the person card and the pair page.

### 5. Push and links (3 to 4 days)
- **Push.**
  - Migration: `push_devices` (user, token, sandbox or production).
  - `src/lib/notify/apns.ts`, with a fake provider like email has. `send` in `src/server/notify.ts` chooses the channel and still writes `notification_log`.
  - Kinds: inbound interest (with Interested and Pass buttons), mutual match, event nudge. The Matches tab count becomes the app badge.
  - The app asks for permission after the first Interested, not at launch.
- **Universal links.** Serve `/.well-known/apple-app-site-association` so `/e/<slug>`, `/matches/<id>` and `/auth/confirm` open the app when it's installed. `/r/<token>` stays on the web, since it works without signing in.

### 6. TestFlight (about 1 week of testing)
- Internal testers get builds at once. External testers (up to 10,000, by link) need a short beta review first.
- Pilot students install from a TestFlight link. Builds expire after 90 days.
- Fix what the pilot finds.

### 7. App Store
- Listing: name, subtitle, description, keywords, screenshots, a 1024 px icon, support URL, privacy policy URL.
- **Privacy answers:** name, email, profile text and a user ID are collected and linked to the user; nothing is used for tracking, so there is no tracking prompt. Add `PrivacyInfo.xcprivacy`.
- Age rating questionnaire, with user-generated content declared.
- Review notes: the app is for Cornell students, how to sign in with the review account, and where Report and Block are.
- Submit, answer the reviewer, release.

## Tests and CI
- **Server:** the existing Vitest and database suites grow with the API.
- **App:** Swift Testing for decoding and view logic; a short XCUITest run against the local stack covering sign-in, an answer on the deck and a match.
- **CI:** a macOS job that builds and runs the Swift tests. The repo is public, so GitHub's standard macOS runners are free. If it goes private, macOS minutes are billed at ten times Linux; ask the owner first.

## Cost
- **Nothing new to buy.** Push (APNs), TestFlight and universal links come with the Apple membership.
- **Vercel:** the app adds API calls to the existing project. Not checked against the current plan's limits.
- **LLM and embeddings:** unchanged; the app uses the same sign-up and profile calls the web does.

## Needs the owner's approval when reached
- Production migrations: `reports`, `blocks`, `push_devices`.
- The hosted Supabase email templates (adding the code) and the redirect list.
- New Vercel environment variables (the APNs key) and each deploy.
- Creating the review account on production.
- Every TestFlight and App Store submission.

## Decisions (owner, 2026-11-11)
- **Native**, not a wrapper.
- **Distribution: TestFlight** for the pilot.
- **Later, under consideration: open to anyone with a `.edu` email.** Not decided. If it happens:
  - the domain check (`app_settings.allowed_email_domains`, `isAllowedEmailDomain`) must accept a `.edu` suffix, not only listed domains;
  - the pilot gate, the "Cornell" wording and the NetID-based test-address rule need a pass;
  - the single-school concern for the public App Store goes away;
  - the terms and the report queue matter more, since members are no longer one campus.
- **Review account: approved.** One production account, `review-001@cornell.edu`, signs in with a fixed code held in an environment variable and sees the demo profiles. It is the one exception to keeping test users off production. Creating it is still a production write, done when phase 7 is reached.
- **Ideas: out.** The app has person cards only and doesn't post ideas, as in P1-24.

## Open questions
Each has a proposed default, used unless the owner says otherwise.
1. **Push and email together?** Proposed: with push on, inbound interest goes by push only, and a mutual match goes by both.
2. **Oldest iOS supported.** Proposed: iOS 18.
3. **Font.** Proposed: the system font, not Inter.

## Alternatives considered
- **Wrap the site (Capacitor).** About a week instead of four, and one set of screens. But the pages are server-rendered, so the app would be a web view on `hackamatch.com`: a real risk of rejection under 4.2, a deck that feels like a web page, and push still needs phases 1 (sign-in), 2 and 5.
- **React Native (Expo).** Shares TypeScript types and zod schemas, and gives Android later. It still needs the whole API and every screen rewritten, and adds a second toolchain. Worth it only if Android is planned.
