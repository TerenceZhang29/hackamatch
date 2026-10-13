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
| 4 | `extractIdea` | "Uber for dogs" | One clarifying question of at most 15 words; the pitch adds no invented detail |
| 5 | `extractProfile`, both | "Designer into fintech and education" | `idea` is null; `skills` has `ux-design` |

For every case also check: the output validates on the first attempt, every tag is in the taxonomy, `summary` is at most 15 words in the third person with no names, and the call finishes well inside onboarding's 8 s budget.

## Status by model

| Model | Provider | Latest prompt version tested | Result |
| --- | --- | --- | --- |
| `gemini-3.5-flash-lite` | `gemini` | `2026-10-13.2`, all five cases | Pass on the idea rule; two tagging misses (see log) |
| `claude-haiku-5-5` | `anthropic` | none | Not run. No live Claude call has been made |

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
