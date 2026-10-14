# HackaMatch — Prompt tuning log

How the extraction prompts in [`src/lib/llm/prompts.ts`](../src/lib/llm/prompts.ts) are tuned, and what each model did with each version. Add an entry whenever `PROMPT_VERSION` changes or a new model is tried.

## How tuning works

- **One prompt for every model.** Claude and Gemini get the same system and user prompts. Only the transport differs: Claude answers through a forced tool call, Gemini through a JSON response format (see `client.ts` and `gemini.ts`). There are no per-model prompt variants yet; add one only if a change that fixes one model is shown to hurt another.
- **Every wording change bumps `PROMPT_VERSION`** and gets an entry below with the cases run, the model, and the results.
- **A change counts as tested only on the models it was run against.** The status table says which those are. Before switching `LLM_PROVIDER` for real users, run the standard cases on that provider.
- **Live runs need the owner's approval** because they call a paid or metered API. They are run as a one-off script that is not kept in the repo; the fake provider covers the automated tests.
- **Prefer a prompt fix, then a code guard.** Rules that code can enforce cheaply are enforced there too: tags outside the taxonomy are dropped by `normalize`, and a `builder` never gets an idea whatever the model returns.

## Standard cases

| # | Call | Input | Expected |
| --- | --- | --- | --- |
| 1 | `extractProfile`, builder | "I build React and Python apps, mostly health stuff" | `stack` has `react` and `python`, `domains` has `health`, `idea` is null, no tags the text does not support |
| 2 | `extractProfile`, idea | "A mobile app that helps nurses swap shifts" | `idea` set, with a pitch of at most 20 words that adds nothing to the text |
| 3 | `extractProfile`, both | "Backend engineer who likes climate projects" | `idea` is null: no product is described |
| 4 | `extractIdea` | "Uber for dogs" | One clarifying question of at most 15 words; the pitch adds no invented detail. A question about both sides of a marketplace ("who would request …, and who would provide …?") counts as one question (accepted by the owner 2026-10-14) |
| 5 | `extractProfile`, both | "Designer into fintech and education" | `idea` is null; `skills` has `ux-design` |
| 6 | `extractProfile`, both | "Data scientist who wants to help farmers" | `idea` is null; `skills` has `data-science`; `domains` has `agriculture` |
| 7 | `extractProfile`, idea | "A marketplace for students to resell textbooks" | `idea` set; the person's `skills` and `stack` are empty, because the text states none (what the idea needs goes only in `idea.skills_needed`) |

Cases 6 and 7 are held out: no prompt rule quotes their wording, so a pass is not the prompt being taught the test. Keep it that way when writing new rules.

For every case also check: the output validates on the first attempt, every tag is in the taxonomy, `summary` is at most 15 words in the third person with no names, and the call finishes well inside onboarding's 8 s budget.

## Status by model

| Model | Provider | Latest prompt version tested | Result |
| --- | --- | --- | --- |
| `gemini-3.5-flash-lite` | `gemini` | `2026-10-13.2`, cases 1 to 5 | Pass on the idea rule; two tagging misses (see log). Not run on `2026-10-14.1` |
| `claude-haiku-5-5` | `anthropic` | `2026-10-14.3`, all seven cases, twice | Pass, 7 of 7 (4 on `2026-10-13.2`, 5 on `.1` and `.2`); small issues listed in the test plan's results |

## Test plans

### Claude Haiku 5.5: first live test

**Status: done 2026-10-14.** Baseline and three fix-and-re-test rounds, all approved by the owner. Version `2026-10-14.3` passes all seven cases twice and is the shipped prompt.

**Why.** The owner chose Claude for production (the default, `LLM_PROVIDER=anthropic`). No live Claude call has been made: the provider is tested only against a mocked SDK client, and the two tagging misses in the log were seen on Gemini, so Claude may not share them.

**What is under test**

- Model `claude-haiku-5-5` through `createAnthropicLlm` in `src/lib/llm/client.ts`, called through `extractProfile` and `extractIdea` exactly as the app calls them.
- Prompt version `2026-10-13.2`, unchanged. Step 1 is a baseline: the prompt changes only after the owner has seen it.

**Steps**

1. **Smoke call.** Case 1 once. Stop if it fails: an authentication or billing error (a bad key or no credit), or a 400 rejecting the forced `tool_choice`, which would mean the wrapper needs the `auto` + prompt approach used for newer Opus and Sonnet models.
2. **Baseline.** Cases 1 to 7, twice each, one call at a time: 14 calls including the smoke call (the smoke call counts as case 1's first run).
3. **Stop and report** to the owner: the results table below, filled in, and a proposed prompt change if any case failed.
4. **Fix, only if needed.** Change only the rules behind failed cases, bump `PROMPT_VERSION`, and log the change under its version.
5. **Re-test.** Cases 1 to 7 twice each on the new version: 14 more calls. A fix that breaks a case that passed is reverted.
6. **Record and ship.** Update the status table and the log, then commit and push. Production config needs no change.

**What is recorded for each call**

- Accepted or rejected, and HTTP status on failure.
- Whether it validated on the first attempt or needed the retry.
- `stop_reason`, latency, input and output tokens (`usage`).
- The raw tool input, before `normalize`, so tags outside the taxonomy are counted, not just silently dropped.
- The normalized result.

**Pass criteria**

- A case passes only if both runs meet its "Expected" column and the shared checks (first-attempt validation, every tag in the taxonomy, `summary` at most 15 words in the third person with no names, pitch at most 20 words, under 8 s).
- One pass and one fail counts as a fail, and the difference between the two runs is recorded.

**Guard rails**

- A one-off script, deleted after the run, like the earlier live tests. It reads the key from `.env.local` and never prints it.
- `LLM_PROVIDER` in `.env.local` stays `fake`; nothing else in local dev or the test suite calls Claude.
- Calls run one at a time. The script counts requests and stops at 28 per step (14 cases plus one retry each), and on the first API error. The SDK's built-in retries on 429 and 5xx responses are not billed.
- No database writes and no emails.

**Cost**

| Step | Calls | Estimate |
| --- | --- | --- |
| 1–2 baseline | 14 | about $0.004 |
| 5 re-test, if needed | 14 | about $0.004 |
| Worst case, every call retried once | up to 56 | about $0.02 |

Assumes about 1,000 input and 150 output tokens per call (measured on Gemini with the same prompt) at Haiku 5.5's listed $0.10 / $0.50 per million tokens. The real figures come from the baseline's `usage` and are recorded here.

**Results: baseline, prompt `2026-10-13.2`, 2026-10-14**

15 requests for 14 case runs (one validation retry). Every request was accepted: Haiku 5.5 takes the forced tool call. All calls finished in 1.1 to 3.2 s. About 2,280 tokens in and 180 to 270 out per call, more than twice the input the plan assumed (the tool schema is sent with every call), so about $0.00034 per call and about $0.005 for the run. No tag fell outside the taxonomy.

| Case | Run 1 | Run 2 | Pass |
| --- | --- | --- | --- |
| 1 | `react`, `python`, `health`; skills `frontend`, `backend`; no idea | Same | Yes |
| 2 | Retry needed: first answer gave `experience_level` as `"\"intermediate\""` (quotes inside the string). Then idea correct, person's skills empty, but a clarifying question was set although nothing is missing, and it asks two things | Idea correct; clarifying question set although nothing is missing | **No** |
| 3 | No idea | No idea | Yes |
| 4 | Pitch invents detail ("people who walk or pet-sit their dogs"); question asks two things | Pitch invents detail ("walk or pick up their dogs") | **No** |
| 5 | `ux-design` and `ui-design`; no idea | Same | Yes |
| 6 | **Invented an idea** ("Helping farmers with a problem the student has not yet specified.") | No idea; `data-science`, `agriculture` | **No** |
| 7 | Idea set; person's skills and stack empty; `skills_needed` empty | Same | Yes |

**What Claude gets wrong, and how it differs from Gemini**

- **The two Gemini misses do not occur on Claude.** It keeps the person's skills apart from the idea's (cases 2 and 7) and turns "Designer" into a skill (case 5).
- **Clarifying questions are over-asked.** Set in all four idea runs of cases 2 and 7, where the user, problem and product are all stated, and three of them join two questions with "and", against the "exactly one thing" rule. Gemini left case 2's question null.
- **Short analogies get invented detail** (case 4, both runs), the same failure Gemini had on version `.1`.
- **A goal without a product sometimes becomes an idea** (case 6, one run of two).
- **One malformed enum** (case 2, run 1): the value came back wrapped in an extra pair of quotes. The retry fixed it, at the cost of about 1.5 s.
- **Ideas often list no `skills_needed`** (case 7, both runs), which leaves matching nothing to work with. Not a case failure, but worth a rule.

**Fix applied as version `2026-10-14.1`**

- `clarifying_question`: null when the text already says who it is for, the problem and what is being built; when one is missing, a single question with no "and".
- Pitch: for an "X for Y" analogy, restate the analogy and add nothing (example "Airbnb for bikes", not a case's wording).
- `idea`: a cause or goal with no named product or project is not an idea (example not taken from a case).
- `skills_needed`: list the skills the idea plainly needs, even when the text names none.
- Code guard: strip a stray pair of quotes from enum values before validation, so a glitch like case 2's does not cost a retry.

Re-test as planned: cases 1 to 7 twice each, 14 calls, about $0.005.

The goal example (`"wants to improve public transit"`) shares case 6's shape but not its wording, so case 6 is only partly held out from here on.

**Results: re-test, prompt `2026-10-14.1`, 2026-10-14**

14 requests for 14 case runs: no retries. The quote glitch came back three times (case 1 twice, case 2 once) and the new guard absorbed it each time. Every call took 1.1 to 1.7 s, with about 2,420 tokens in and 175 to 280 out; about $0.005 for the run, about $0.01 for both runs together.

| Case | Run 1 | Run 2 | Pass |
| --- | --- | --- | --- |
| 1 | `react`, `python`, `health`; no idea | Same | Yes |
| 2 | **Regression:** the person now gets the skill `mobile`; clarifying question still set although nothing is missing (now a single question) | Same | **No** |
| 3 | No idea | No idea | Yes |
| 4 | Pitch fixed: "An Uber-style service for dogs."; question still joins two with "and" | Same | **No** |
| 5 | `ux-design`, `ui-design`; no idea | Same | Yes |
| 6 | No idea | No idea | Yes (fixed) |
| 7 | Person's skills empty; `skills_needed` now `frontend`, `backend`, `ui-design`; an unneeded single question | Same | Yes |

5 of 7 pass, up from 4. Fixed: invented pitch detail, the invented idea, empty `skills_needed`, and the retry from the quote glitch. Not fixed: clarifying questions are still asked when nothing is missing (cases 2 and 7), and case 4's question still has two parts. New: case 2's person picked up the idea's skill, the miss Gemini had, most likely because the new `skills_needed` rule ("an app needs frontend or mobile") bled into the person's tags.

**Round 2: version `2026-10-14.2`**, approved by the owner. Changes from `.1`:

- New person rule: skills and stack are what the person says they can do; wanting to build something is not a skill, so an idea person who names no skills has empty skills and stack.
- Stricter question rule: "if in doubt, null"; ask only when a teammate could not tell who the idea is for or what is being built; never about platform, features, scale or scope; one question, never two joined with "and".

**Results: round 2, prompt `2026-10-14.2`, 2026-10-14**

14 requests, no retries (the quote glitch appeared twice and the guard absorbed it). 1.1 to 3.1 s per call, about 2,500 tokens in; about $0.005, about $0.015 for all three runs.

| Case | Run 1 | Run 2 | Pass |
| --- | --- | --- | --- |
| 1 | `react`, `python`, `health`; no idea | Same | Yes |
| 2 | Person's skills empty; no question | Same | Yes (fixed) |
| 3 | No idea | No idea | Yes |
| 4 | Pitch "An Uber-style service for dogs."; question "Who would request these dog services, and who would provide them?" | Same | **No:** still two parts joined with "and" |
| 5 | **Regression:** `skills` empty; "Designer" no longer gives `ux-design` | Same | **No** |
| 6 | No idea | No idea | Yes |
| 7 | Person's skills empty; `skills_needed` set; no question | Same | Yes |

5 of 7 again, with a different pair failing. Fixed: the idea's skill leaking into the person's tags, and every unneeded question. New: the person rule ("what the person says they can do") is now read so strictly that a job title no longer counts (case 5), which breaks a case that passed on both earlier versions. Case 4's two-part question has survived three wordings of the rule.

**Round 3: version `2026-10-14.3`**, approved by the owner, who also accepted case 4's two-sided marketplace question as one question (the case's expectation now says so). Change from `.2`: one sentence added to the person rule, "A job title or role does state a skill: a web developer can do frontend, an ML engineer ml." The examples are not any case's wording.

**Results: round 3, prompt `2026-10-14.3`, 2026-10-14**

14 requests, no retries (the quote glitch appeared twice and the guard absorbed it). 1.0 to 1.5 s per call, about 2,530 tokens in; about $0.005, about $0.02 for all four runs.

| Case | Run 1 | Run 2 | Pass |
| --- | --- | --- | --- |
| 1 | `react`, `python`, `health`; no idea | Same | Yes |
| 2 | Person's skills empty; idea with `skills_needed`; no question | Same, but the person's domain came back `enterprise-saas` instead of `health` | Yes |
| 3 | No idea | No idea | Yes |
| 4 | Pitch "An Uber-style service for dogs"; the accepted two-sided question | Same | Yes |
| 5 | `ux-design`, `ui-design`; no idea | Same | Yes (fixed again) |
| 6 | No idea | No idea | Yes |
| 7 | Person's skills empty; `skills_needed` set; no question | Same, but the summary ends "no personal skills stated" | Yes |

All seven pass on both runs.

**Smaller issues left, none a case failure**

- Case 2, run 2: the person's domain was `enterprise-saas`, while the idea's domain was correctly `health`.
- Case 7, run 2: the public summary ended "; no personal skills stated", which echoes the prompt's rules into text other students see.
- Case 4, run 1: `skills_needed` included `marketplace`, a domain tag; `normalize` dropped it, as designed.
- Summaries sometimes begin "Idea person wanting …", which reads awkwardly on a card.
- One run per case per version: results vary between runs, so a pass here is two samples, not a guarantee.

## Log

### `2026-10-13.1` — first version

Run on `gemini-3.5-flash-lite`, all four cases. Every call validated on the first attempt in 1.0 to 1.4 s, with about 900 tokens in and 100 out. No tag fell outside the taxonomy.

| Case | Result |
| --- | --- |
| 1 | Pass, with padding: added `javascript` and `fullstack`, which the sentence does not state |
| 2 | Pass: pitch "A mobile app that helps nurses swap shifts easily." |
| 3 | **Fail:** invented an idea ("A climate-focused software project addressing an environmental problem.") |
| 4 | Question asked as intended, but the pitch invented detail (trips to the vet and the groomer) |

### `2026-10-13.2` — stop invented ideas, tags and pitch detail

Changes, each aimed at one failure above:

- **`idea` rule (case 3).** Was "fill this in only when … the text describes a product or project to build". Now `null` unless the text names a specific thing the person wants to build, with skills, a job title or an interest in an area called out as not an idea, and "never invent an idea".
- **Tag rule (case 1).** Was "only what the text supports". Now "only what the text states"; a named framework still implies its skill, but never another stack tag.
- **Pitch rule (case 4).** Added: use only what the text says, add no users, features or use cases, and when the text is thin restate it plainly and let the clarifying question ask for more.

Re-run on `gemini-3.5-flash-lite`, cases 1, 3 and 4. All validated on the first attempt in 0.8 to 1.3 s; the longer prompt is about 990 tokens in.

| Case | Result |
| --- | --- |
| 1 | Pass: `stack` is `react`, `python`; `skills` is `frontend`, `backend`; no idea |
| 3 | Pass: `idea` is null |
| 4 | Pass: pitch is "Uber for dogs"; question "What specific service is being provided for dogs?" |

Follow-up run on the same version, to check that case 3 was not passing only because the rule quotes its wording, and to cover case 2:

| Case | Result |
| --- | --- |
| 2 | Pass on the idea: pitch "A mobile app that helps nurses swap shifts.", domain `health`. **Miss:** gave the person the skill `mobile`, though wanting a mobile app does not mean they can build one |
| 5 | Pass on the idea: `idea` is null with wording the prompt does not quote. **Miss:** `skills` is empty; "Designer" should give `ux-design` |

Case 2 took 3.1 s, against about 1 s for every other call so far.

Limits of this result:

- **Two tagging misses are open.** The model reads an idea's needs as the person's own skills (case 2), and after the tag rule was tightened to "only what the text states" it no longer turns a job title into a skill (case 5). The next prompt version should say that a role or title implies its skill, and that for an idea person `skills` is what they can do, not what the idea needs.
- **One run per case.** Model output varies between runs; a single pass does not show how often a case passes.

## Known differences between models

- **Gemini is told to "call `record_profile`"** by the shared prompt although it has no tool; it answers in JSON regardless. Harmless so far. If per-model prompts are introduced, this sentence is the first thing to vary.
- **Claude skips thinking on a forced tool call** (Haiku 5.5), while Gemini Flash-Lite thinks minimally by default. Neither has needed a change.
