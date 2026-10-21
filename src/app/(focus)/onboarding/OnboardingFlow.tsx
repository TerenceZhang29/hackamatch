"use client";

import { useState, useTransition } from "react";
import { EventPicker, type PickableEvent } from "@/components/EventPicker";
import { TagEditor, type TagGroup, type TagValues } from "@/components/TagEditor";
import { buttonClass } from "@/components/ui/Button";
import { FieldError, inputClass, labelClass } from "@/components/ui/Field";
import { LINKEDIN_TEXT_MAX } from "@/lib/imports/linkedin";
import { IDEA_OR_SKILL_REQUIRED, onboardingOutcome, QUICK_SKILLS } from "@/lib/onboarding";
import { tagLabel } from "@/lib/taxonomy/labels";
import { joinPool, submitSentence } from "./actions";
import { ANSWER_MAX, SENTENCE_MAX, type INTENTS, type ROLES } from "./schema";

type Role = (typeof ROLES)[number];
type Intent = (typeof INTENTS)[number];

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "idea", label: "I have an idea" },
  { value: "builder", label: "I can build" },
  { value: "both", label: "Both" },
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
  const [role, setRole] = useState<Role | null>(initial.role);
  const [intents, setIntents] = useState<Intent[]>(
    initial.intents.length ? initial.intents : ["hackathon"],
  );
  const [name, setName] = useState(initial.name);
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
        name,
        sentence,
        githubUrl,
        linkedinUrl,
        linkedinText,
      });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      if (result.status === "ok") {
        const { summary, tags: inferred, idea } = result.result;
        setTags({ ...inferred, skills: [...new Set([...inferred.skills, ...picks])] });
        setExtracted({
          status: "ok",
          summary,
          idea: idea
            ? { id: idea.id, pitch: idea.pitch, question: idea.clarifying_question }
            : null,
        });
      } else {
        setTags({ skills: picks, stack: [], domains: [] });
        setExtracted({ status: "pending" });
      }
      setStep(3);
    });
  }

  // The idea-or-skill rule (P1-21), judged once tags are in; while they're
  // still coming in the background, joining stays open.
  const ideaFound = extracted?.status === "ok" && extracted.idea !== null;
  const outcome =
    role && extracted?.status === "ok" ? onboardingOutcome(role, ideaFound, tags) : null;
  const blocked = outcome !== null && !outcome.ok;

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
            if (role && intents.length) setStep(2);
          }}
        >
          <h1 className="text-2xl font-bold tracking-tight">Who are you?</h1>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">I&apos;m here because…</legend>
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((option) => (
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
          <div className="flex flex-col gap-2">
            <label htmlFor="name" className={labelClass}>
              First name <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="given-name"
              maxLength={80}
              className={inputClass}
            />
          </div>
          <button type="submit" disabled={!role || intents.length === 0} className={primaryButton}>
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
          <QuickSkills
            selected={picks}
            onToggle={(slug) =>
              setPicks((current) =>
                current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug],
              )
            }
          />
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
          ) : (
            <p role="status" className="text-muted">
              We&apos;ll fill in your tags in a moment. You can join now and edit them later.
            </p>
          )}
          {outcome?.ok && role !== "builder" && !ideaFound ? (
            <p className="text-sm text-muted">No idea found, so you&apos;ll join as a builder.</p>
          ) : null}
          {blocked ? (
            <div className="flex flex-col gap-3 rounded-2xl bg-danger-soft p-4">
              <p role="alert" className="text-sm font-medium text-danger-ink">
                {IDEA_OR_SKILL_REQUIRED}
              </p>
              <QuickSkills
                selected={tags.skills}
                onToggle={(slug) => {
                  setError(null);
                  setTags((current) => ({
                    ...current,
                    skills: current.skills.includes(slug)
                      ? current.skills.filter((s) => s !== slug)
                      : [...current.skills, slug],
                  }));
                }}
              />
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
