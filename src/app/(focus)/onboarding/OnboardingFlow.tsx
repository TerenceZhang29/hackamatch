"use client";

import { useState, useTransition } from "react";
import { EventPicker, type PickableEvent } from "@/components/EventPicker";
import { TagEditor, type TagGroup, type TagValues } from "@/components/TagEditor";
import { LINKEDIN_TEXT_MAX } from "@/lib/imports/linkedin";
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

const primaryButton =
  "rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900";
const chip = (on: boolean) =>
  `rounded-full border px-4 py-2 text-sm ${
    on
      ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
      : "border-neutral-300 dark:border-neutral-700"
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
        setTags(inferred);
        setExtracted({
          status: "ok",
          summary,
          idea: idea
            ? { id: idea.id, pitch: idea.pitch, question: idea.clarifying_question }
            : null,
        });
      } else {
        setExtracted({ status: "pending" });
      }
      setStep(3);
    });
  }

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
            className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-neutral-900 dark:bg-neutral-100" : "bg-neutral-200 dark:bg-neutral-800"}`}
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
          <h1 className="text-3xl font-bold tracking-tight">Who are you?</h1>
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
            <label htmlFor="name" className="text-sm font-medium">
              First name <span className="font-normal text-neutral-500">(optional)</span>
            </label>
            <input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="given-name"
              maxLength={80}
              className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
            />
          </div>
          <button type="submit" disabled={!role || intents.length === 0} className={primaryButton}>
            Continue
          </button>
        </form>
      ) : null}

      {step === 2 && role ? (
        <form className="flex flex-col gap-4" onSubmit={submitStep2}>
          <h1 className="text-3xl font-bold tracking-tight">One sentence</h1>
          <label htmlFor="sentence" className="text-sm font-medium">
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
            className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-base outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
          />
          <details className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
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
                  className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
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
                  className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
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
                  className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
                />
              </div>
              <p className="text-xs text-neutral-500">
                We read your public GitHub repositories to suggest tags. We never fetch LinkedIn.
              </p>
            </div>
          </details>
          {error ? <ErrorText message={error} /> : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-lg border border-neutral-300 px-4 py-2 dark:border-neutral-700"
            >
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
          <h1 className="text-3xl font-bold tracking-tight">Here&apos;s what we got</h1>
          {extracted.status === "ok" ? (
            <>
              {extracted.summary ? (
                <p className="text-lg text-neutral-700 dark:text-neutral-300">
                  {extracted.summary}
                </p>
              ) : null}
              {extracted.idea?.pitch ? (
                <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                  <p className="text-sm font-medium text-neutral-500">
                    Your idea, as others will see it
                  </p>
                  <p className="mt-1">{extracted.idea.pitch}</p>
                </div>
              ) : null}
              {extracted.idea?.question ? (
                <div className="flex flex-col gap-2">
                  <label htmlFor="answer" className="text-sm font-medium">
                    {extracted.idea.question}{" "}
                    <span className="font-normal text-neutral-500">(optional)</span>
                  </label>
                  <input
                    id="answer"
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    maxLength={ANSWER_MAX}
                    className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
                  />
                </div>
              ) : null}
            </>
          ) : (
            <p role="status" className="text-neutral-600 dark:text-neutral-400">
              We&apos;ll fill in your tags in a moment. You can join now and edit them later.
            </p>
          )}
          <TagEditor value={tags} onChange={setTags} suggestions={suggestions} />
          <EventPicker events={events} selected={eventIds} onChange={setEventIds} />
          {error ? <ErrorText message={error} /> : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-lg border border-neutral-300 px-4 py-2 dark:border-neutral-700"
            >
              Back
            </button>
            <button type="submit" disabled={pending} className={`flex-1 ${primaryButton}`}>
              {pending ? "Joining…" : "Join the pool"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function ErrorText({ message }: { message: string }) {
  return (
    <p id="onboarding-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}
