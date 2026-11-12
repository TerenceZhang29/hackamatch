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

### 0. Apple setup (owner): done 2026-11-11, as reported by the owner
- Bundle ID `com.hackamatch.app`, with Push Notifications and Associated Domains.
- App record "HackaMatch" in App Store Connect.
- Team ID `5B89U2CMF9`. It is public by nature: it appears in the app and in the associated-domains file.
- An APNs auth key (`.p8`), held by the owner outside the repo. The key and its ID go into Vercel as environment variables in phase 5.

### 1. Server: API and sign-in for the app: built 2026-11-11, not deployed
No change for web users. Nothing is on production: the hosted email templates and a deploy both wait for the owner.
- **Bearer sign-in.** `getApiUser(request)` in `src/lib/api/auth.ts` reads `Authorization: Bearer <Supabase access token>`, checks it, and loads the caller's row as that user. No cookies, so no cross-site risk and no origin check.
- **Sign in with a 6-digit code.**
  - Both email templates (`supabase/templates/`) show `{{ .Token }}` under the link. The link and the code are the same single-use sign-in.
  - `POST /api/v1/auth/request` reuses `sendMagicLink`, so the domain check, rate limits and pilot gate all apply.
  - `POST /api/v1/auth/verify` checks the code (10 guesses per address per hour) and returns the access and refresh tokens.
  - `POST /api/v1/auth/refresh` and `/auth/signout`. The app keeps tokens in the Keychain and needs no Supabase library.
- **Sign-up needs no waiting answers.** The web keeps answers in `pending_signups` because its link may open on another device. The app asks the same four steps, keeps the answers on the phone, verifies the code, then posts them to `POST /signup`.
- **Routes** (`src/app/api/v1/`), each a thin wrapper over the `src/server` functions the web uses. `src/server/api-views.ts` shapes the responses.

  | Route | Backs |
  |---|---|
  | `GET /me`, `PATCH /me`, `DELETE /me?confirm=delete` | Me tab: name, areas and skills, pause, delete account |
  | `POST /signup` | the four sign-up steps |
  | `GET /taxonomy` | areas and skills for the pickers |
  | `GET /deck?event=`, `POST /deck/answer`, `POST /deck/undo` | Discover; 30 cards a page |
  | `GET /people/:id` | a full profile and the caller's standing with them |
  | `GET /events`, `GET /events/:slug`, `PUT /events/:slug/going` | Events (public reads; a member's token adds more) |
  | `GET /matches`, `GET /matches/:id`, `POST /matches/:id/answer` | Matches and the pair page |
  | `POST /matches/:id/hackathons`, `POST /matches/:id/team`, `POST /teams/:id/members` | pick a hackathon, "We teamed up", add a teammate |

  Still to come: `PUT /devices` (phase 5). Report and block arrived in phase 2.
- **One contract for both sides** (`src/lib/api/schemas.ts`):
  - responses are strict objects, missing values are `null`, and tags carry their label, so the app needs no copy of the taxonomy;
  - errors are `{ error: { code, message } }` with an HTTP status; the codes are listed in `src/lib/api/http.ts`;
  - `ios/Fixtures/*.json` are hand-written samples. `tests/unit/api-contract.test.ts` checks each against its schema, and the Swift tests will decode the same files.
- **Tests:** `tests/unit/api-contract.test.ts`, and `tests/e2e/api.spec.ts` (its own Playwright project, `api`), which calls the routes as the app does and checks every response against the contract: code sign-in, sign-up, refresh and sign-out; refused domains; missing and bad tokens; the public routes; two members matching, picking a hackathon and teaming up; going to an event; profile changes; account deletion.
- **Inventory:** `docs/security.md`.

**Known limit:** Supabase counts code checks per caller IP, and ours all come from the server. Its limit (30 per 5 minutes locally; check the hosted project's setting) is shared by everyone signing in at once, as it already is for the web's link.

**To put on production (each needs the owner's approval):**
1. Add the `{{ .Token }}` line to the two hosted email templates, and check the hosted OTP length is 6.
2. Merge and deploy. No migration.

### 2. Server and web: what App Review requires: built 2026-11-11, not committed or deployed
- **Report and block** (`src/server/safety.ts`, migration `20261111000000_reports_blocks.sql`).
  - `blocks` and `reports` are server-only tables. Reasons: harassment, inappropriate content, spam, fake profile, something else, with an optional note.
  - **A block works both ways.** Neither person sees the other in the deck, the board, person pages, event-page avatars, the matches list and badge, the pair page or "Your hackathons", whoever blocked. Answering a blocked person's card says "not available", the same as someone who left the pool.
  - **A report also blocks**, and emails every admin (`Report` template, logged as kind `report`).
  - **Web:** "Report or block" under a person's card (`/people/<id>`) and at the foot of the pair page; "Blocked people" with Unblock on `/me`. Plain forms, so they work without JavaScript.
  - **Admin:** `/admin/reports` lists open reports oldest first, then resolved ones, with Pause account and Resolve. The admin home shows the open count.
  - **API:** `POST /reports`, `GET /blocks`, `PUT /blocks/:id`, `DELETE /blocks/:id`.
  - **Limit:** 20 reports and blocks per member per day.
- **`/terms` and `/privacy`**, linked from the landing page, `/me` and sign-up's last step ("By joining you agree to the Terms and Privacy policy"). `users.terms_accepted_at` records the moment of joining; it is null for accounts from before the terms.
- **Tests:** database (`reports-blocks`), unit (report input, the report email, the `blocks.json` sample), browser (`safety.spec.ts`, the API spec, and axe on `/terms`, `/privacy` and `/admin/reports`).

**Not covered:**
- The web deck has no report button on the card itself; it is on the person's page. The iOS card will have it in a menu.
- An admin can still make a manual match between two people who blocked each other; neither would see it.
- An admin whose own notifications are off gets no report email.

**Assumed in the legal pages, for the owner to confirm before they go live:**
- members must be at least 18;
- the contact address is `hello@hackamatch.com`, and someone reads it;
- the pages don't name who runs HackaMatch;
- the companies listed are Supabase, Vercel, Resend, Voyage AI and Anthropic.

They are plain-language drafts, not legal advice.

**To put on production (each needs the owner's approval):**
1. Back up, then apply the migration (`supabase db push`, after a dry run lists exactly it).
2. Merge and deploy.

### 3. App: skeleton, sign-in, Discover: built 2026-11-11
- **Project:** `ios/project.yml` (XcodeGen) generates `ios/HackaMatch.xcodeproj`. SwiftUI, iPhone only, iOS 18+, Swift 6 with the main actor as the default; no third-party packages. Bundle ID `com.hackamatch.app`, team `5B89U2CMF9`.
- **Two configurations:** Debug calls `http://localhost:3000` (local Supabase, fake providers, codes from Mailpit); Release calls `https://hackamatch.com`.
- **API client** (`API/APIClient.swift`): bearer token, refreshed a minute before it expires or on a 401, one refresh at a time; the session is in the Keychain (this device only, after first unlock). A refresh token the server refuses signs the person out; being offline doesn't.
- **Models** (`API/Models.swift`) mirror `src/lib/api/schemas.ts`; `HackaMatchTests/FixtureTests.swift` decodes every file in `ios/Fixtures`.
- **Design:** the tokens from `globals.css` in light and dark (`Design/Theme.swift`), SF Symbols, a native tab bar, the system font.
- **Screens:**
  - landing, with the next five hackathons rolling every 3 seconds (still under Reduce Motion);
  - sign-up's four steps, the same rules and search as the web, the email last; "By joining you agree to the Terms and Privacy policy";
  - the code screen (fills from the email with one tap, checks itself at six digits, "Send a new code");
  - "I already have an account": email, then code;
  - Discover: the hackathon chips, the card (swipe right for Interested, left to Pass, tap for the full profile), the round Pass, Interested and Undo buttons, "It's a match!", and the full profile with Pass, Interested and Report or block;
  - Events and Matches link to the website for now; Me has the name, email, pause state and Sign out.
- **Sign-up after the code fails:** the person stays signed in and sign-up reopens on its last step with their answers.
- **Accessibility:** VoiceOver names match the web ("Pass", "Interested", "Undo"); the card has Pass and Interested actions; selected chips and rows say so; Dynamic Type throughout.
- **Tests:** 23 unit tests (`HackaMatchTests`: the samples, the deck, sign-up's rules), and one UI test (`HackaMatchUITests`, `ios/scripts/test-ui.sh`) against the local stack: sign-up with the emailed code, the deck, Pass and Undo, the full profile, Sign out. It saves screenshots in the test results.

- **App icon:** Option I, "Pieces that fit", from the owner's design canvas (2026-11-11). The source is `ios/Artwork/AppIcon.svg`; `AppIcon.png` in the asset catalog is it at 1024 px, square and opaque (iOS rounds the corners).
- **CI:** `.github/workflows/ios.yml` builds the app and runs the unit tests on `macos-26` when `ios/` or `src/lib/api/` changes. The UI test needs the local stack, so it stays local.

**Not done yet:** push (phase 5).

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
