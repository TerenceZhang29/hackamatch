"use client";

import { buttonClass } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { useState, useTransition } from "react";
import { EventPicker, type PickableEvent } from "@/components/EventPicker";
import { TagEditor, type TagGroup, type TagValues } from "@/components/TagEditor";
import { FIRST_NAME_MAX, LAST_NAME_MAX } from "@/app/(focus)/onboarding/schema";
import { displayName, joinName, splitName } from "@/lib/display-name";
import {
  deleteMyAccount,
  saveName,
  saveTags,
  setEventInterest,
  setPause,
  type ActionResult,
} from "./actions";

const primaryButton = buttonClass("primary", "sm");
const secondaryButton = buttonClass("outline", "sm");
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
  const [first, setFirst] = useState(() => splitName(name).firstName);
  const [last, setLast] = useState(() => splitName(name).lastName);
  const action = useAction();
  const full = joinName(first, last);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        action.run(() => saveName({ firstName: first, lastName: last }));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="me-first-name" className="text-sm font-medium">
            First name
          </label>
          <input
            id="me-first-name"
            value={first}
            onChange={(event) => setFirst(event.target.value)}
            maxLength={FIRST_NAME_MAX}
            autoComplete="given-name"
            required
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="me-last-name" className="text-sm font-medium">
            Last name <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="me-last-name"
            value={last}
            onChange={(event) => setLast(event.target.value)}
            maxLength={LAST_NAME_MAX}
            autoComplete="family-name"
            className={inputClass}
          />
        </div>
      </div>
      <p className="text-sm text-muted">
        {first.trim()
          ? `Public pages show "${displayName(full)}"; matches see "${first.trim()}".`
          : "Add your first name."}
      </p>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={action.pending || !first.trim() || full === name.trim()}
          className={primaryButton}
        >
          {action.pending ? "Saving…" : "Save name"}
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
