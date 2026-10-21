"use client";

import { Lock } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { inputClass, Select } from "@/components/ui/Field";
import { useState, useTransition } from "react";
import { IdeaTags } from "@/components/IdeaTags";
import type { ExtractedIdea } from "@/lib/llm/extract-idea";
import { IDEA_TEXT_MAX } from "../schema";
import { postIdea, previewIdea } from "./actions";

const primaryButton = buttonClass("primary", "md");

export function NewIdeaForm({ events }: { events: { id: string; name: string }[] }) {
  const [text, setText] = useState("");
  const [eventId, setEventId] = useState("");
  const [preview, setPreview] = useState<{ idea: ExtractedIdea | null } | null>(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onPreview(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await previewIdea({ text });
      if (result.status === "error") setError(result.message);
      else setPreview({ idea: result.status === "ok" ? result.idea : null });
    });
  }

  function onPost() {
    setError(null);
    startTransition(async () => {
      const result = await postIdea({
        text,
        eventId: eventId || null,
        preview: preview?.idea ?? null,
        answer: preview?.idea?.clarifying_question ? answer : null,
      });
      // postIdea redirects on success; a returned value is an error.
      if (result?.error) setError(result.error);
    });
  }

  const errorText = error ? (
    <p role="alert" className="text-sm text-danger-ink">
      {error}
    </p>
  ) : null;

  if (preview) {
    const idea = preview.idea;
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold tracking-tight">How it will look</h1>
        {idea ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
            <p className="text-sm font-medium text-muted">Public pitch</p>
            <p className="text-lg">{idea.pitch}</p>
            <IdeaTags domain={idea.domain} scope={idea.scope} skillsNeeded={idea.skills_needed} />
          </div>
        ) : (
          <p role="status" className="text-muted">
            Pitch and tags coming in a moment.
          </p>
        )}
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <Lock aria-hidden="true" className="size-4" />
          Only the pitch is public
        </p>
        {idea?.clarifying_question ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="answer" className="text-sm font-medium">
              {idea.clarifying_question} <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id="answer"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              maxLength={300}
              className={inputClass}
            />
          </div>
        ) : null}
        {errorText}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPreview(null)}
            className="rounded-lg border border-line px-4 py-2"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onPost}
            disabled={pending}
            className={`flex-1 ${primaryButton}`}
          >
            {pending ? "Posting…" : "Post"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onPreview}>
      <h1 className="text-2xl font-bold tracking-tight">Post an idea</h1>
      <label htmlFor="idea-text" className="text-sm font-medium">
        Your idea in one or two sentences
      </label>
      <textarea
        id="idea-text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="An app that lets nurses swap shifts without a manager in the loop"
        rows={4}
        required
        minLength={10}
        maxLength={IDEA_TEXT_MAX}
        autoFocus
        className={inputClass}
      />
      {events.length ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="idea-event" className="text-sm font-medium">
            For a hackathon <span className="font-normal text-muted">(optional)</span>
          </label>
          <Select
            id="idea-event"
            value={eventId}
            onChange={(event) => setEventId(event.target.value)}
          >
            <option value="">No particular event</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      {errorText}
      <button type="submit" disabled={pending || text.trim().length < 10} className={primaryButton}>
        {pending ? "Reading your idea…" : "Preview"}
      </button>
    </form>
  );
}
