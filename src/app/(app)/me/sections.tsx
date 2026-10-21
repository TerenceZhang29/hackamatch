"use client";

import { buttonClass } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { inputClass } from "@/components/ui/Field";
import Link from "next/link";
import { useState, useTransition } from "react";
import { EventPicker, type PickableEvent } from "@/components/EventPicker";
import { TagEditor, type TagGroup, type TagValues } from "@/components/TagEditor";
import type { INTENTS, ROLES } from "@/app/(focus)/onboarding/schema";
import { NAME_MAX, SENTENCE_MAX } from "@/app/(focus)/onboarding/schema";
import { displayName } from "@/lib/display-name";
import {
  changeIdeaStatus,
  deleteMyAccount,
  saveName,
  saveRole,
  saveSentence,
  saveTags,
  setEventInterest,
  setPause,
  type ActionResult,
} from "./actions";

type Role = (typeof ROLES)[number];
type Intent = (typeof INTENTS)[number];

const primaryButton = buttonClass("primary", "sm");
const secondaryButton = buttonClass("outline", "sm");
const chip = (on: boolean) =>
  `rounded-full px-4 py-2 text-sm font-medium transition ${
    on ? "bg-accent text-accent-ink" : "bg-bg text-ink ring-1 ring-line hover:bg-surface-2"
  }`;

/** Runs a server action and keeps its outcome for display. */
function useAction() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (action: () => Promise<ActionResult>) =>
    startTransition(async () => setResult(await action()));
  return { pending, result, run, clear: () => setResult(null) };
}

function Outcome({ result, saved = "Saved" }: { result: ActionResult | null; saved?: string }) {
  if (!result) return null;
  if (!result.ok) {
    return <p className="text-sm text-danger-ink">{result.error}</p>;
  }
  return (
    <p role="status" className="text-sm text-muted">
      {result.notice ?? saved}
    </p>
  );
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const id = title.toLowerCase().replaceAll(/[^a-z]+/g, "-");
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 rounded-2xl bg-surface p-5">
      <h2 id={id} className="text-base font-semibold">
        {title}
      </h2>
      {description ? <p className="text-sm text-muted">{description}</p> : null}
      {children}
    </section>
  );
}

export function NameSection({ name }: { name: string }) {
  const [value, setValue] = useState(name);
  const action = useAction();
  const firstName = displayName(value).split(" ")[0];
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        action.run(() => saveName({ name: value }));
      }}
    >
      <label htmlFor="me-name" className="text-sm font-medium">
        Full name
      </label>
      <input
        id="me-name"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={NAME_MAX}
        autoComplete="name"
        className={inputClass}
      />
      <p className="text-sm text-muted">
        {value.trim()
          ? `Public pages show "${displayName(value)}"; matches see "${firstName}".`
          : 'With no name, public pages show "Cornell student".'}
      </p>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={action.pending || value.trim() === name}
          className={primaryButton}
        >
          {action.pending ? "Saving…" : "Save name"}
        </button>
        <Outcome result={action.result} />
      </div>
    </form>
  );
}

export function SentenceSection({ sentence }: { sentence: string }) {
  const [value, setValue] = useState(sentence);
  const action = useAction();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        action.run(() => saveSentence({ sentence: value }));
      }}
    >
      <label htmlFor="me-sentence" className="sr-only">
        Edit your sentence
      </label>
      <textarea
        id="me-sentence"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={3}
        maxLength={SENTENCE_MAX}
        className={inputClass}
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={action.pending || value.trim() === sentence}
          className={primaryButton}
        >
          {action.pending ? "Saving…" : "Save sentence"}
        </button>
        <Outcome result={action.result} />
      </div>
    </form>
  );
}

export function TagsSection({
  tags,
  suggestions,
}: {
  tags: TagValues;
  suggestions: Record<TagGroup, string[]>;
}) {
  const [value, setValue] = useState(tags);
  const action = useAction();
  return (
    <div className="flex flex-col gap-3">
      <TagEditor value={value} onChange={setValue} suggestions={suggestions} />
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={action.pending}
          onClick={() => action.run(() => saveTags({ tags: value }))}
          className={primaryButton}
        >
          {action.pending ? "Saving…" : "Save tags"}
        </button>
        <Outcome result={action.result} />
      </div>
    </div>
  );
}

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

export function RoleSection({ role, intents }: { role: Role; intents: Intent[] }) {
  const [currentRole, setRole] = useState(role);
  const [currentIntents, setIntents] = useState(intents);
  const action = useAction();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Role">
        {ROLE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={currentRole === option.value}
            onClick={() => setRole(option.value)}
            className={chip(currentRole === option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Looking for">
        {INTENT_OPTIONS.map((option) => {
          const on = currentIntents.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setIntents(
                  on
                    ? currentIntents.filter((i) => i !== option.value)
                    : [...currentIntents, option.value],
                )
              }
              className={chip(on)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={action.pending || currentIntents.length === 0}
          onClick={() => action.run(() => saveRole({ role: currentRole, intents: currentIntents }))}
          className={primaryButton}
        >
          {action.pending ? "Saving…" : "Save"}
        </button>
        <Outcome result={action.result} />
      </div>
    </div>
  );
}

export function EventsSection({
  events,
  selected,
}: {
  events: PickableEvent[];
  selected: string[];
}) {
  const [value, setValue] = useState(selected);
  const action = useAction();
  if (events.length === 0) {
    return <p className="text-sm text-muted">No upcoming hackathons yet.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <EventPicker
        events={events}
        selected={value}
        onChange={(next) => {
          const added = next.find((id) => !value.includes(id));
          const removed = value.find((id) => !next.includes(id));
          const eventId = added ?? removed;
          if (!eventId) return;
          setValue(next);
          action.run(() => setEventInterest({ eventId, interested: Boolean(added) }));
        }}
      />
      <Outcome result={action.result} />
    </div>
  );
}

export interface IdeaRow {
  id: string;
  pitch: string | null;
  raw_text: string;
  status: "open" | "filled" | "archived" | "draft";
}

const STATUS_LABELS = { open: "Open", filled: "Filled", archived: "Archived" } as const;

export function IdeasSection({ ideas }: { ideas: IdeaRow[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {ideas.map((idea) => (
        <IdeaItem key={idea.id} idea={idea} />
      ))}
    </ul>
  );
}

function IdeaItem({ idea }: { idea: IdeaRow }) {
  // A draft is posted or discarded on its own page (P1-22), not here.
  if (idea.status === "draft") {
    return (
      <li className="flex flex-col gap-2 rounded-xl bg-bg p-3">
        <Link href={`/ideas/${idea.id}`} className="font-medium hover:underline">
          {idea.pitch ?? idea.raw_text}
        </Link>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <Chip tone="idea">Draft</Chip>
          Only you can see it.{" "}
          <Link href={`/ideas/${idea.id}`} className="underline">
            Check it and post it
          </Link>
        </p>
      </li>
    );
  }
  return <IdeaStatusItem idea={{ ...idea, status: idea.status }} />;
}

function IdeaStatusItem({
  idea,
}: {
  idea: IdeaRow & { status: Exclude<IdeaRow["status"], "draft"> };
}) {
  const [status, setStatus] = useState(idea.status);
  const action = useAction();
  return (
    <li className="flex flex-col gap-2 rounded-xl bg-bg p-3">
      <Link href={`/ideas/${idea.id}`} className="font-medium hover:underline">
        {idea.pitch ?? idea.raw_text}
      </Link>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Idea status">
        {(Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[]).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={status === value}
            disabled={action.pending}
            onClick={() => {
              setStatus(value);
              action.run(() => changeIdeaStatus({ ideaId: idea.id, status: value }));
            }}
            className={status === value ? primaryButton : secondaryButton}
          >
            {STATUS_LABELS[value]}
          </button>
        ))}
        <Outcome result={action.result} />
      </div>
    </li>
  );
}

export function PauseSection({ pausedLabel }: { pausedLabel: string | null }) {
  const action = useAction();
  return (
    <div className="flex flex-col gap-2">
      {pausedLabel ? <p className="text-sm font-medium">{pausedLabel}</p> : null}
      <div className="flex flex-wrap gap-2">
        {pausedLabel ? (
          <button
            type="button"
            disabled={action.pending}
            onClick={() => action.run(() => setPause({ choice: "resume" }))}
            className={primaryButton}
          >
            Turn matches back on
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={action.pending}
              onClick={() => action.run(() => setPause({ choice: "week" }))}
              className={secondaryButton}
            >
              Pause for a week
            </button>
            <button
              type="button"
              disabled={action.pending}
              onClick={() => action.run(() => setPause({ choice: "month" }))}
              className={secondaryButton}
            >
              Pause for a month
            </button>
            <button
              type="button"
              disabled={action.pending}
              onClick={() => action.run(() => setPause({ choice: "indefinite" }))}
              className={secondaryButton}
            >
              Pause until I turn it back on
            </button>
          </>
        )}
      </div>
      <Outcome result={action.result} />
    </div>
  );
}

export function DeleteSection() {
  const [confirm, setConfirm] = useState("");
  const action = useAction();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        action.run(() => deleteMyAccount({ confirm: confirm.trim().toLowerCase() }));
      }}
    >
      <label htmlFor="delete-confirm" className="text-sm">
        Type <span className="font-mono">delete</span> to remove your account, ideas and matches for
        good.
      </label>
      <div className="flex gap-2">
        <input
          id="delete-confirm"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          autoComplete="off"
          className={`min-w-0 flex-1 ${inputClass}`}
        />
        <button
          type="submit"
          disabled={action.pending || confirm.trim().toLowerCase() !== "delete"}
          className={buttonClass("danger", "sm")}
        >
          {action.pending ? "Deleting…" : "Delete account"}
        </button>
      </div>
      <Outcome result={action.result} />
    </form>
  );
}
