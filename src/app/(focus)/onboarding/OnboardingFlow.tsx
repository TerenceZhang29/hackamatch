"use client";

import { useState, useTransition } from "react";
import { EventPicker, type PickableEvent } from "@/components/EventPicker";
import { TagEditor, type TagGroup, type TagValues } from "@/components/TagEditor";
import { buttonClass } from "@/components/ui/Button";
import { FieldError, inputClass, labelClass } from "@/components/ui/Field";
import { LINKEDIN_TEXT_MAX } from "@/lib/imports/linkedin";
import { BLOCK_MESSAGES, onboardingOutcome, QUICK_SKILLS } from "@/lib/onboarding";
import { tagLabel } from "@/lib/taxonomy/labels";
import {
  joinPool,
  onboardingStatus,
  submitSentence,
  switchToBuilder,
  type SentenceResult,
} from "./actions";
import {
  ANSWER_MAX,
  FIRST_NAME_MAX,
  LAST_NAME_MAX,
  SENTENCE_MAX,
  type INTENTS,
  type ROLES,
} from "./schema";
import { splitName } from "@/lib/display-name";

type Role = (typeof ROLES)[number];
type Intent = (typeof INTENTS)[number];

/** The two sign-up routes (P1-22). "both" is set later, in settings or by posting an idea. */
const ROUTE_OPTIONS: { value: "idea" | "builder"; label: string }[] = [
  { value: "idea", label: "I have an idea" },
  { value: "builder", label: "I want to find an idea to build" },
];

const INTENT_OPTIONS: { value: Intent; label: string }[] = [
  { value: "hackathon", label: "Hackathon partner" },
  { value: "side_project", label: "Side project" },
  { value: "cofounder", label: "Co-founder" },
];

const PLACEHOLDERS: Record<Role, string> = {
  idea: "A mobile app that helps nurses swap shifts",
  builder: "I build iOS apps in Swift and like health projects",
  both: "I want to build a study-group finder and I can do the backend",
};

const SENTENCE_LABELS: Record<Role, string> = {
  idea: "Your idea in one sentence",
  builder: "What you can build, in one sentence",
  both: "Your idea and what you can build",
};

const primaryButton = buttonClass("primary", "lg");
const backButton = buttonClass("secondary", "lg");
const chip = (on: boolean) =>
  `rounded-full px-4 py-2.5 text-sm font-medium transition ${
    on ? "bg-accent text-accent-ink" : "bg-surface text-ink hover:bg-surface-2"
  }`;

const smallChip = (on: boolean) =>
  `rounded-full px-3 py-1.5 text-sm font-medium transition ${
    on ? "bg-accent text-accent-ink" : "bg-surface text-ink hover:bg-surface-2"
  }`;

const quickToggle = (list: readonly string[], slug: string) =>
  list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug];

export interface OnboardingInitial {
  name: string;
  role: Role | null;
  intents: Intent[];
  sentence: string;
}

type Extracted =
  | {
      status: "ok";
      summary: string | null;
      idea: { id: string; pitch: string | null; question: string | null } | null;
      /** A builder's sentence also described an idea, saved as a draft. */
      draft: boolean;
    }
  | { status: "pending" };

export function OnboardingFlow({
  initial,
  events,
  initialEventIds = [],
  next,
  suggestions,
}: {
  initial: OnboardingInitial;
  events: PickableEvent[];
  /** Preselected events, e.g. the one whose share link brought the user here. */
  initialEventIds?: string[];
  next: string | null;
  suggestions: Record<TagGroup, string[]>;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  // Only the two routes are offered; an older "both" starts unchosen.
  const [role, setRole] = useState<Role | null>(initial.role === "both" ? null : initial.role);
  const [intents, setIntents] = useState<Intent[]>(
    initial.intents.length ? initial.intents : ["hackathon"],
  );
  const [firstName, setFirstName] = useState(() => splitName(initial.name).firstName);
  const [lastName, setLastName] = useState(() => splitName(initial.name).lastName);
  const [sentence, setSentence] = useState(initial.sentence);
  const [githubUrl, setGithubUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [linkedinText, setLinkedinText] = useState("");
  const canSubmitSentence = sentence.trim().length >= 3 || githubUrl.trim().length > 0;
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [tags, setTags] = useState<TagValues>({ skills: [], stack: [], domains: [] });
  /** Skills tapped from the quick picks on step 2, added to the tags on step 3. */
  const [picks, setPicks] = useState<string[]>([]);
  const [eventIds, setEventIds] = useState<string[]>(initialEventIds);
  const [answer, setAnswer] = useState("");
  /** "Check again" came back still waiting: offer the builder route (idea route only). */
  const [retryFailed, setRetryFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleIntent(intent: Intent) {
    setIntents((current) =>
      current.includes(intent) ? current.filter((i) => i !== intent) : [...current, intent],
    );
  }

  function submitStep2(event: React.FormEvent) {
    event.preventDefault();
    if (!role) return;
    setError(null);
    startTransition(async () => {
      const result = await submitSentence({
        role,
        intents,
        firstName,
        lastName,
        sentence,
        githubUrl,
        linkedinUrl,
        linkedinText,
      });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      setRetryFailed(false);
      applyReading(result, picks);
      setStep(3);
    });
  }

  /** Shows a finished reading (merging in any picked skills), or "still reading". */
  function applyReading(result: Exclude<SentenceResult, { status: "error" }>, picked: string[]) {
    if (result.status === "ok") {
      const { summary, tags: inferred, idea, draft } = result.result;
      setTags({ ...inferred, skills: [...new Set([...inferred.skills, ...picked])] });
      setExtracted({
        status: "ok",
        summary,
        idea: idea ? { id: idea.id, pitch: idea.pitch, question: idea.clarifying_question } : null,
        draft,
      });
    } else {
      setTags((current) => ({ ...current, skills: [...new Set([...current.skills, ...picked])] }));
      setExtracted({ status: "pending" });
    }
  }

  function checkAgain() {
    setError(null);
    startTransition(async () => {
      const result = await onboardingStatus();
      if (result.status === "error") return setError(result.message);
      applyReading(result, tags.skills);
      if (result.status === "pending") setRetryFailed(true);
    });
  }

  function joinAsBuilder() {
    setError(null);
    startTransition(async () => {
      const result = await switchToBuilder();
      if (result.ok) setRole("builder");
    });
  }

  function toggleSkill(slug: string) {
    setError(null);
    setTags((current) => ({ ...current, skills: quickToggle(current.skills, slug) }));
  }

  // The route's rule (P1-22): the idea route needs an idea, the builder
  // route a skill. The server checks the same in joinPool.
  const outcome =
    role && extracted
      ? onboardingOutcome(role, {
          extracted: extracted.status === "ok",
          hasIdea: extracted.status === "ok" && extracted.idea !== null,
          tags,
        })
      : null;
  const blocked = outcome !== null && !outcome.ok;
  const reason = outcome && !outcome.ok ? outcome.reason : null;

  function submitStep3(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const idea = extracted?.status === "ok" ? extracted.idea : null;
    startTransition(async () => {
      const result = await joinPool({
        tags,
        eventIds,
        ideaId: idea?.id ?? null,
        clarifyingAnswer: idea?.question ? answer : null,
        next,
      });
      // joinPool redirects on success; a returned value is an error.
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex gap-2" aria-label={`Step ${step} of 3`}>
        {[1, 2, 3].map((n) => (
          <li
            key={n}
            aria-current={n === step ? "step" : undefined}
            className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-accent" : "bg-surface-2"}`}
          />
        ))}
      </ol>

      {step === 1 ? (
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (role && intents.length && firstName.trim()) setStep(2);
          }}
        >
          <h1 className="text-2xl font-bold tracking-tight">Who are you?</h1>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">
              Do you have an idea, or do you want to find one to build?
            </legend>
            <div className="flex flex-wrap gap-2">
              {ROUTE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={role === option.value}
                  onClick={() => setRole(option.value)}
                  className={chip(role === option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-sm text-muted">
              You can change this later in settings. Once you&apos;ve joined, you can do both.
            </p>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Looking for a…</legend>
            <div className="flex flex-wrap gap-2">
              {INTENT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={intents.includes(option.value)}
                  onClick={() => toggleIntent(option.value)}
                  className={chip(intents.includes(option.value))}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="first-name" className={labelClass}>
                First name
              </label>
              <input
                id="first-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                autoComplete="given-name"
                maxLength={FIRST_NAME_MAX}
                required
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="last-name" className={labelClass}>
                Last name <span className="font-normal text-muted">(optional)</span>
              </label>
              <input
                id="last-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                autoComplete="family-name"
                maxLength={LAST_NAME_MAX}
                className={inputClass}
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={!role || intents.length === 0 || !firstName.trim()}
            className={primaryButton}
          >
            Continue
          </button>
        </form>
      ) : null}

      {step === 2 && role ? (
        <form className="flex flex-col gap-4" onSubmit={submitStep2}>
          <h1 className="text-2xl font-bold tracking-tight">One sentence</h1>
          <label htmlFor="sentence" className={labelClass}>
            {SENTENCE_LABELS[role]}
          </label>
          <textarea
            id="sentence"
            value={sentence}
            onChange={(event) => setSentence(event.target.value)}
            placeholder={PLACEHOLDERS[role]}
            rows={3}
            required={!githubUrl.trim()}
            maxLength={SENTENCE_MAX}
            autoFocus
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "onboarding-error" : undefined}
            className={inputClass}
          />
          {role === "builder" ? (
            <QuickSkills
              selected={picks}
              onToggle={(slug) => setPicks((current) => quickToggle(current, slug))}
            />
          ) : null}
          <details className="rounded-2xl bg-surface px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">
              Or import from GitHub or LinkedIn
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="github" className="text-sm">
                  GitHub profile
                </label>
                <input
                  id="github"
                  value={githubUrl}
                  onChange={(event) => setGithubUrl(event.target.value)}
                  placeholder="github.com/yourname"
                  inputMode="url"
                  autoComplete="url"
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="linkedin" className="text-sm">
                  LinkedIn profile
                </label>
                <input
                  id="linkedin"
                  value={linkedinUrl}
                  onChange={(event) => setLinkedinUrl(event.target.value)}
                  placeholder="linkedin.com/in/yourname"
                  inputMode="url"
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="linkedin-text" className="text-sm">
                  Paste your LinkedIn About or Experience
                </label>
                <textarea
                  id="linkedin-text"
                  value={linkedinText}
                  onChange={(event) => setLinkedinText(event.target.value)}
                  rows={3}
                  maxLength={LINKEDIN_TEXT_MAX}
                  className={inputClass}
                />
              </div>
              <p className="text-xs text-muted">
                Public GitHub repos only. LinkedIn is never fetched.
              </p>
            </div>
          </details>
          {error ? <ErrorText message={error} /> : null}
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep(1)} className={backButton}>
              Back
            </button>
            <button
              type="submit"
              disabled={pending || !canSubmitSentence}
              className={`flex-1 ${primaryButton}`}
            >
              {pending ? "Reading your sentence…" : "Continue"}
            </button>
          </div>
        </form>
      ) : null}

      {step === 3 && extracted ? (
        <form className="flex flex-col gap-6" onSubmit={submitStep3}>
          <h1 className="text-2xl font-bold tracking-tight">Here&apos;s what we got</h1>
          {extracted.status === "ok" ? (
            <>
              {extracted.summary ? <p className="text-lg text-ink">{extracted.summary}</p> : null}
              {extracted.idea?.pitch ? (
                <div className="rounded-2xl bg-surface p-4">
                  <p className="text-sm font-medium text-muted">Your idea, as others will see it</p>
                  <p className="mt-1">{extracted.idea.pitch}</p>
                </div>
              ) : null}
              {extracted.idea?.question ? (
                <div className="flex flex-col gap-2">
                  <label htmlFor="answer" className="text-sm font-medium">
                    {extracted.idea.question}{" "}
                    <span className="font-normal text-muted">(optional)</span>
                  </label>
                  <input
                    id="answer"
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    maxLength={ANSWER_MAX}
                    className={inputClass}
                  />
                </div>
              ) : null}
            </>
          ) : null}
          {extracted.status === "ok" && extracted.draft && role === "builder" ? (
            <p className="rounded-2xl bg-accent-soft p-4 text-sm">
              We found an idea in your sentence too. It&apos;s saved as a draft that only you can
              see: check it and post it after you join.
            </p>
          ) : null}
          {reason === "pending-idea" ? (
            <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
              <p role="status" className="text-sm font-medium">
                {retryFailed
                  ? "We still can't read your idea. The AI is slow right now."
                  : BLOCK_MESSAGES["pending-idea"]}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={checkAgain}
                  disabled={pending}
                  className={buttonClass("outline", "md")}
                >
                  Check again
                </button>
                {retryFailed ? (
                  <button
                    type="button"
                    onClick={joinAsBuilder}
                    disabled={pending}
                    className={buttonClass("primary", "md")}
                  >
                    Join as a builder instead
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          {reason === "no-idea" ? (
            <p
              role="alert"
              className="rounded-2xl bg-danger-soft p-4 text-sm font-medium text-danger-ink"
            >
              {BLOCK_MESSAGES["no-idea"]}
            </p>
          ) : null}
          {reason === "no-skill" || reason === "pending-builder" ? (
            <div className="flex flex-col gap-3 rounded-2xl bg-danger-soft p-4">
              <p role="alert" className="text-sm font-medium text-danger-ink">
                {BLOCK_MESSAGES[reason]}
              </p>
              <QuickSkills selected={tags.skills} onToggle={toggleSkill} />
              {reason === "pending-builder" ? (
                <button
                  type="button"
                  onClick={checkAgain}
                  disabled={pending}
                  className={buttonClass("outline", "md", "self-start")}
                >
                  Check again
                </button>
              ) : null}
            </div>
          ) : null}
          <TagEditor value={tags} onChange={setTags} suggestions={suggestions} />
          <EventPicker events={events} selected={eventIds} onChange={setEventIds} />
          {error ? <ErrorText message={error} /> : null}
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep(2)} className={backButton}>
              Back
            </button>
            <button
              type="submit"
              disabled={pending || blocked}
              className={`flex-1 ${primaryButton}`}
            >
              {pending ? "Joining…" : "Join the pool"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function ErrorText({ message }: { message: string }) {
  return <FieldError id="onboarding-error">{message}</FieldError>;
}

/** One-tap common skills (QUICK_SKILLS), as toggle chips. */
function QuickSkills({
  selected,
  onToggle,
}: {
  selected: readonly string[];
  onToggle: (slug: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">
        Quick picks <span className="font-normal text-muted">(skills, optional)</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {QUICK_SKILLS.map((slug) => (
          <button
            key={slug}
            type="button"
            aria-pressed={selected.includes(slug)}
            onClick={() => onToggle(slug)}
            className={smallChip(selected.includes(slug))}
          >
            {tagLabel(slug)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
