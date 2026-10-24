"use client";

import { ArrowLeft, Check, CircleHelp, MailCheck, Plus, Search } from "lucide-react";
import { useState, useTransition } from "react";
import { FieldError, labelClass } from "@/components/ui/Field";
import {
  areaChips,
  MAX_AREAS,
  MAX_SKILLS,
  searchByName,
  searchSkills,
  skillChips,
  suggestAreas,
  type SignupAnswers,
} from "@/lib/signup";
import { displayLabel } from "@/lib/taxonomy/labels";
import { formatEventDates } from "@/lib/time";

export interface SignupEvent {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

/** What the last step does with the answers: `/signup` sends a link, `/onboarding` joins at once. */
export type SignupSubmit = (
  answers: SignupAnswers,
  email: string | null,
) => Promise<{ ok: true; email?: string } | { ok: false; error: string }>;

/** Hackathons offered as rows on step 1; the rest are found by searching. */
const ROWS = 4;

/** Sizes from the mockup (docs/plans/p1-24-redesign.md): 56px buttons, 48px fields. */
const primaryButton =
  "flex h-14 w-full items-center justify-center rounded-xl bg-accent text-base font-semibold text-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted";
const field =
  "h-12 w-full rounded-xl border border-line bg-bg px-3.5 text-[15px] text-ink outline-none transition focus:border-2 focus:border-accent";

const chip = (on: boolean, off: boolean) =>
  `inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-[15px] font-medium transition ${
    on
      ? "bg-accent-soft text-accent-soft-ink ring-2 ring-accent"
      : off
        ? "cursor-not-allowed bg-surface text-muted ring-1 ring-dashed ring-line"
        : "bg-surface text-ink hover:bg-surface-2"
  }`;

function Progress({ step }: { step: number }) {
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label={`Step ${step} of 4`}>
      {[1, 2, 3, 4].map((n) => (
        <li
          key={n}
          aria-current={n === step ? "step" : undefined}
          className={`h-1 rounded-full ${n <= step ? "bg-accent" : "bg-surface-2"}`}
        />
      ))}
    </ol>
  );
}

function Heading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-[30px] leading-[1.15] font-bold tracking-[-0.02em]">{title}</h1>
      {hint ? <p className="text-[15px] text-muted">{hint}</p> : null}
    </div>
  );
}

function Counter({ title, count, max }: { title: string; count: number; max: number }) {
  return (
    <span className="flex items-baseline justify-between gap-3">
      <span className="text-[17px] font-semibold">{title}</span>
      <span className="shrink-0 text-[13px] font-medium text-muted">
        {count} of {max}
      </span>
    </span>
  );
}

function SearchBox({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
        />
        <input
          id={id}
          type="search"
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={`${id}-results`}
          className={`${field} pl-10`}
        />
      </div>
    </div>
  );
}

function toggle(list: string[], value: string, max = Infinity): string[] {
  if (list.includes(value)) return list.filter((item) => item !== value);
  return list.length >= max ? list : [...list, value];
}

/**
 * Sign-up in four steps (P1-24): hackathons, areas, skills, then name (and
 * email on `/signup`). Every pick is from a supported list: searches never
 * add free text, so no AI is needed.
 */
export function SignupFlow({
  events,
  initialEventIds,
  initialName,
  askEmail,
  submit,
}: {
  /** Every upcoming event, soonest first. */
  events: SignupEvent[];
  /** Ticked on arrival, from an event page's "Discover who's going". */
  initialEventIds: string[];
  initialName: { firstName: string; lastName: string };
  /** `/signup` asks for the email last; `/onboarding` is already signed in. */
  askEmail: boolean;
  submit: SignupSubmit;
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [eventIds, setEventIds] = useState(initialEventIds);
  const [undecided, setUndecided] = useState(false);
  const [domains, setDomains] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [firstName, setFirstName] = useState(initialName.firstName);
  const [lastName, setLastName] = useState(initialName.lastName);
  const [email, setEmail] = useState("");
  const [eventQuery, setEventQuery] = useState("");
  const [areaQuery, setAreaQuery] = useState("");
  const [skillQuery, setSkillQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (sentTo) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-10 text-center">
        <MailCheck aria-hidden="true" className="size-12 text-accent" strokeWidth={1.6} />
        <h1 className="text-2xl font-bold tracking-tight">Check your inbox</h1>
        <p className="text-muted">
          Link sent to <span className="font-medium break-all text-ink">{sentTo}</span>. Open it to
          finish joining.
        </p>
      </div>
    );
  }

  const rows = [
    ...events.slice(0, ROWS),
    ...events.slice(ROWS).filter((event) => eventIds.includes(event.id)),
  ];
  const eventMatches = searchByName(events, eventQuery, (event) => event.name);
  const areaSuggestions = suggestAreas(areaQuery, domains);
  const skillMatches = searchSkills(skillQuery);
  const chips = skillChips(skills);
  const back = (to: 1 | 2 | 3) => (
    <button
      type="button"
      onClick={() => setStep(to)}
      aria-label="Back"
      className="-ml-2 inline-flex size-11 items-center justify-center rounded-full hover:bg-surface"
    >
      <ArrowLeft aria-hidden="true" className="size-5" />
    </button>
  );
  const header = (
    <div className="flex flex-col gap-4">
      <div className="flex h-11 items-center justify-between">
        {step > 1 ? back((step - 1) as 1 | 2 | 3) : <span />}
        <span className="text-[13px] font-medium text-muted">Step {step} of 4</span>
      </div>
      <Progress step={step} />
    </div>
  );
  const continueButton = (disabled = false, describedBy?: string) => (
    <button
      type="submit"
      disabled={disabled}
      aria-describedby={describedBy}
      className={primaryButton}
    >
      Continue
    </button>
  );
  const next = (to: 2 | 3 | 4) => (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setStep(to);
  };

  if (step === 1) {
    return (
      <form onSubmit={next(2)} className="flex flex-col gap-7">
        {header}
        <Heading title="Pick your hackathon" hint="You can always edit this later" />
        <fieldset className="flex flex-col gap-2.5">
          <legend className="sr-only">Hackathons</legend>
          {rows.map((event) => {
            const on = eventIds.includes(event.id);
            return (
              <button
                key={event.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setEventIds(toggle(eventIds, event.id));
                  setUndecided(false);
                }}
                className={`flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition ${
                  on ? "bg-accent-soft ring-2 ring-accent" : "bg-surface hover:bg-surface-2"
                }`}
              >
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">{event.name}</span>
                  <span className="text-[13px] text-muted">
                    {formatEventDates(event.start_date, event.end_date)}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={`flex size-[22px] shrink-0 items-center justify-center rounded-md ${
                    on ? "bg-accent text-accent-ink" : "bg-bg ring-1 ring-line"
                  }`}
                >
                  {on ? <Check className="size-3.5" strokeWidth={3} /> : null}
                </span>
              </button>
            );
          })}

          <div className="mt-2 flex flex-col gap-2">
            <SearchBox
              id="event-search"
              label="Something else?"
              placeholder="Search by name"
              value={eventQuery}
              onChange={setEventQuery}
            />
            <div id="event-search-results" aria-live="polite">
              {eventQuery.trim() ? (
                eventMatches.length ? (
                  <ul className="flex flex-col gap-1 rounded-xl bg-bg p-1.5 shadow-lg ring-1 ring-line">
                    {eventMatches.map((event) => (
                      <li key={event.id}>
                        <button
                          type="button"
                          onClick={() => {
                            if (!eventIds.includes(event.id)) setEventIds([...eventIds, event.id]);
                            setUndecided(false);
                            setEventQuery("");
                          }}
                          className="flex w-full flex-col items-start rounded-lg px-3 py-2 text-left hover:bg-surface"
                        >
                          <span className="font-medium">{event.name}</span>
                          <span className="text-sm text-muted">
                            {formatEventDates(event.start_date, event.end_date)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p role="status" className="text-sm text-muted">
                    No results
                  </p>
                )
              ) : null}
            </div>
          </div>

          <div aria-hidden="true" className="mt-1 flex items-center gap-3 text-sm text-muted">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>
          <button
            type="button"
            aria-pressed={undecided}
            onClick={() => {
              setUndecided(!undecided);
              if (!undecided) setEventIds([]);
            }}
            className={`flex min-h-13 w-full items-center justify-between gap-3 rounded-2xl px-4 transition ${
              undecided
                ? "bg-accent-soft text-accent-soft-ink ring-2 ring-accent"
                : "bg-bg ring-2 ring-line hover:bg-surface"
            }`}
          >
            <span className="flex items-center gap-3 text-[15px] font-medium">
              <CircleHelp aria-hidden="true" className="size-5" />
              Undecided yet
            </span>
            <span
              aria-hidden="true"
              className={`flex size-[22px] shrink-0 items-center justify-center rounded-md ${
                undecided ? "bg-accent text-accent-ink" : "bg-bg ring-1 ring-line"
              }`}
            >
              {undecided ? <Check className="size-3.5" strokeWidth={3} /> : null}
            </span>
          </button>
        </fieldset>
        {continueButton()}
      </form>
    );
  }

  if (step === 2) {
    const full = domains.length >= MAX_AREAS;
    return (
      <form onSubmit={next(3)} className="flex flex-col gap-7">
        {header}
        <Heading title="Getting to your visions" hint="So your matches come faster" />
        <fieldset className="flex flex-col gap-3.5">
          <legend className="mb-3.5 w-full">
            <Counter title="Which area(s) do you hack?" count={domains.length} max={MAX_AREAS} />
          </legend>
          <div className="flex flex-wrap gap-2">
            {areaChips(domains).map((slug) => {
              const on = domains.includes(slug);
              const off = full && !on;
              return (
                <button
                  key={slug}
                  type="button"
                  aria-pressed={on}
                  aria-disabled={off || undefined}
                  onClick={() => !off && setDomains(toggle(domains, slug, MAX_AREAS))}
                  className={chip(on, off)}
                >
                  {on ? <Check aria-hidden="true" className="size-3.5" strokeWidth={3} /> : null}
                  {displayLabel(slug)}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="flex flex-col gap-2.5">
          <SearchBox
            id="area-search"
            label="Something special? Search all areas"
            placeholder="e.g. space, pets, music"
            value={areaQuery}
            onChange={setAreaQuery}
          />
          <div id="area-search-results" aria-live="polite" className="flex flex-col gap-2">
            {areaSuggestions.length ? (
              <>
                <span className="text-xs font-semibold tracking-wide text-muted uppercase">
                  {areaQuery.trim() ? "Matching and related areas" : "Related to your picks"}
                </span>
                <div className="flex flex-wrap gap-2">
                  {areaSuggestions.map(({ slug, related }) => {
                    const on = domains.includes(slug);
                    const off = full && !on;
                    return (
                      <button
                        key={slug}
                        type="button"
                        aria-pressed={on}
                        aria-disabled={off || undefined}
                        onClick={() => !off && setDomains(toggle(domains, slug, MAX_AREAS))}
                        className={`${chip(on, off)} h-9 px-3 text-sm`}
                      >
                        {on ? (
                          <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
                        ) : (
                          <Plus aria-hidden="true" className="size-3.5" />
                        )}
                        {displayLabel(slug)}
                        {related && areaQuery.trim() ? (
                          <span className="text-xs text-muted">· related</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : areaQuery.trim() ? (
              <p role="status" className="text-sm text-muted">
                No results
              </p>
            ) : null}
          </div>
        </div>
        {continueButton()}
      </form>
    );
  }

  if (step === 3) {
    const full = skills.length >= MAX_SKILLS;
    const skillChip = (slug: string) => {
      const on = skills.includes(slug);
      const off = full && !on;
      return (
        <button
          key={slug}
          type="button"
          aria-pressed={on}
          aria-disabled={off || undefined}
          onClick={() => !off && setSkills(toggle(skills, slug, MAX_SKILLS))}
          className={chip(on, off)}
        >
          {on ? <Check aria-hidden="true" className="size-3.5" strokeWidth={3} /> : null}
          {displayLabel(slug)}
        </button>
      );
    };
    return (
      <form onSubmit={next(4)} className="flex flex-col gap-7">
        {header}
        <Heading title="Now your specialty" />
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-3.5 w-full">
            <Counter title="Pick your top skills" count={skills.length} max={MAX_SKILLS} />
          </legend>
          {(["technical", "business"] as const).map((group) => (
            <div
              key={group}
              role="group"
              aria-labelledby={`skills-${group}`}
              className="flex flex-col gap-2.5"
            >
              <h2
                id={`skills-${group}`}
                className="text-xs font-semibold tracking-wide text-muted uppercase"
              >
                {group === "technical" ? "Technical" : "Business"}
              </h2>
              <div className="flex flex-wrap gap-2">{chips[group].map(skillChip)}</div>
            </div>
          ))}
        </fieldset>
        <div className="flex flex-col gap-2">
          <SearchBox
            id="skill-search"
            label="Or type it in"
            placeholder="e.g. Rust, Figma, robotics"
            value={skillQuery}
            onChange={setSkillQuery}
          />
          <div id="skill-search-results" aria-live="polite">
            {!skillQuery.trim() ? null : full && skillMatches.length ? (
              <p role="status" className="text-sm text-muted">
                You have {MAX_SKILLS} skills. Remove one to add another.
              </p>
            ) : skillMatches.length ? (
              <ul className="flex flex-col gap-1 rounded-xl bg-bg p-1.5 shadow-lg ring-1 ring-line">
                {skillMatches.map((slug) => (
                  <li key={slug}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!skills.includes(slug))
                          setSkills([...skills, slug].slice(0, MAX_SKILLS));
                        setSkillQuery("");
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left font-medium hover:bg-surface"
                    >
                      {displayLabel(slug)}
                      {skills.includes(slug) ? (
                        <Check aria-hidden="true" className="size-4 text-accent" strokeWidth={3} />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p role="status" className="text-sm text-muted">
                No results
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {continueButton(skills.length === 0, skills.length === 0 ? "skill-needed" : undefined)}
          {skills.length === 0 ? (
            <p id="skill-needed" className="text-center text-sm text-muted">
              Pick at least one skill to continue
            </p>
          ) : null}
        </div>
      </form>
    );
  }

  const answers: SignupAnswers = { firstName, lastName, eventIds, undecided, domains, skills };
  return (
    <form
      className="flex flex-col gap-7"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await submit(answers, askEmail ? email : null);
          if (!result.ok) setError(result.error);
          else if (result.email) setSentTo(result.email);
        });
      }}
    >
      {header}
      <Heading title="Lastly, a little about you" />
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="first-name" className={`${labelClass} flex justify-between`}>
            First name <span className="font-normal text-muted">Required</span>
          </label>
          <input
            id="first-name"
            required
            autoComplete="given-name"
            maxLength={40}
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            className={field}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="last-name" className={`${labelClass} flex justify-between`}>
            Last name <span className="font-normal text-muted">Optional</span>
          </label>
          <input
            id="last-name"
            autoComplete="family-name"
            maxLength={40}
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            aria-describedby="last-name-note"
            className={field}
          />
          <p id="last-name-note" className="text-[13px] text-muted">
            Only your initial is shown to others, like Maya P.
          </p>
        </div>
        {askEmail ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className={`${labelClass} flex justify-between`}>
              Email <span className="font-normal text-muted">Required</span>
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder="netid@cornell.edu"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-describedby="email-note"
              className={field}
            />
            <p id="email-note" className="text-[13px] text-muted">
              We&apos;ll email you a link to finish joining.
            </p>
          </div>
        ) : null}
        {error ? <FieldError id="signup-error">{error}</FieldError> : null}
      </div>
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Sending…" : "Join HackaMatch"}
      </button>
    </form>
  );
}
