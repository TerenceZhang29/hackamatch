"use client";

import { useState, useTransition } from "react";
import { IdeaTags } from "@/components/IdeaTags";
import type { ExtractedIdea } from "@/lib/llm/extract-idea";
import { IDEA_TEXT_MAX } from "../schema";
import { postIdea, previewIdea } from "./actions";

const inputClass =
  "rounded-lg border border-neutral-300 bg-transparent px-3 py-2 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100";
const primaryButton =
  "rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900";

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
    <p role="alert" className="text-sm text-red-600 dark:text-red-400">
      {error}
    </p>
  ) : null;

  if (preview) {
    const idea = preview.idea;
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold tracking-tight">How it will look</h1>
        {idea ? (
          <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <p className="text-sm font-medium text-neutral-500">Public pitch</p>
            <p className="text-lg">{idea.pitch}</p>
            <IdeaTags domain={idea.domain} scope={idea.scope} skillsNeeded={idea.skills_needed} />
          </div>
        ) : (
          <p role="status" className="text-neutral-600 dark:text-neutral-400">
            We&apos;ll write the public pitch and tags in a moment. You can post now.
          </p>
        )}
        <p className="text-sm text-neutral-500">
          Others see only the pitch and tags. Your full text is shown to someone only after you both
          say you&apos;re interested.
        </p>
        {idea?.clarifying_question ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="answer" className="text-sm font-medium">
              {idea.clarifying_question}{" "}
              <span className="font-normal text-neutral-500">(optional)</span>
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
            className="rounded-lg border border-neutral-300 px-4 py-2 dark:border-neutral-700"
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
      <h1 className="text-3xl font-bold tracking-tight">Post an idea</h1>
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
            For a hackathon <span className="font-normal text-neutral-500">(optional)</span>
          </label>
          <select
            id="idea-event"
            value={eventId}
            onChange={(event) => setEventId(event.target.value)}
            className={inputClass}
          >
            <option value="">No particular event</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {errorText}
      <button type="submit" disabled={pending || text.trim().length < 10} className={primaryButton}>
        {pending ? "Reading your idea…" : "Preview"}
      </button>
    </form>
  );
}
