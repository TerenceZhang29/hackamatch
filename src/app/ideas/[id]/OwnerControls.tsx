"use client";

import { useState, useTransition } from "react";
import { TagEditor, tagLabel } from "@/components/TagEditor";
import { answerIdeaQuestion, saveIdeaStatus, saveIdeaTags, type IdeaActionResult } from "./actions";

type Scope = "weekend" | "few_weeks" | "ongoing";
type Status = "open" | "filled" | "archived";

const selectClass =
  "rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700";
const primaryButton =
  "rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900";

function Outcome({ result }: { result: IdeaActionResult | null }) {
  if (!result) return null;
  return result.ok ? (
    <p role="status" className="text-sm text-neutral-600 dark:text-neutral-400">
      Saved
    </p>
  ) : (
    <p className="text-sm text-red-600 dark:text-red-400">{result.error}</p>
  );
}

function useAction() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<IdeaActionResult | null>(null);
  return {
    pending,
    result,
    run: (action: () => Promise<IdeaActionResult>) =>
      startTransition(async () => setResult(await action())),
  };
}

export function OwnerControls({
  ideaId,
  skillsNeeded,
  domain,
  scope,
  status,
  question,
  skillSuggestions,
  domainOptions,
}: {
  ideaId: string;
  skillsNeeded: string[];
  domain: string | null;
  scope: Scope | null;
  status: Status;
  question: string | null;
  skillSuggestions: string[];
  domainOptions: string[];
}) {
  const [skills, setSkills] = useState({ skills: skillsNeeded });
  const [currentDomain, setDomain] = useState(domain ?? "");
  const [currentScope, setScope] = useState<Scope | "">(scope ?? "");
  const [currentStatus, setStatus] = useState(status);
  const [answer, setAnswer] = useState("");
  const tags = useAction();
  const statusAction = useAction();
  const answerAction = useAction();

  return (
    <div className="flex flex-col gap-8">
      {question ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            answerAction.run(() => answerIdeaQuestion({ ideaId, answer }));
          }}
        >
          <label htmlFor="idea-answer" className="text-sm font-medium">
            Add one detail to get better matches: {question}
          </label>
          <div className="flex gap-2">
            <input
              id="idea-answer"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              maxLength={300}
              className={`min-w-0 flex-1 ${selectClass}`}
            />
            <button
              type="submit"
              disabled={!answer.trim() || answerAction.pending}
              className={primaryButton}
            >
              Add
            </button>
          </div>
          <Outcome result={answerAction.result} />
        </form>
      ) : null}

      <section className="flex flex-col gap-3" aria-label="Edit tags">
        <TagEditor
          groups={["skills"]}
          labels={{ skills: "Skills needed" }}
          value={skills}
          onChange={setSkills}
          suggestions={{ skills: skillSuggestions }}
        />
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Area
            <select
              value={currentDomain}
              onChange={(e) => setDomain(e.target.value)}
              className={selectClass}
            >
              <option value="">None</option>
              {domainOptions.map((slug) => (
                <option key={slug} value={slug}>
                  {tagLabel(slug)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Scope
            <select
              value={currentScope}
              onChange={(e) => setScope(e.target.value as Scope | "")}
              className={selectClass}
            >
              <option value="">Not sure</option>
              <option value="weekend">Weekend build</option>
              <option value="few_weeks">A few weeks</option>
              <option value="ongoing">Ongoing</option>
            </select>
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={tags.pending}
            onClick={() =>
              tags.run(() =>
                saveIdeaTags({
                  ideaId,
                  skillsNeeded: skills.skills,
                  domain: currentDomain || null,
                  scope: currentScope || null,
                }),
              )
            }
            className={primaryButton}
          >
            Save tags
          </button>
          <Outcome result={tags.result} />
        </div>
      </section>

      <section className="flex flex-col gap-2" aria-label="Status">
        <p className="text-sm font-medium">Status</p>
        <div className="flex flex-wrap items-center gap-2">
          {(["open", "filled", "archived"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={currentStatus === value}
              disabled={statusAction.pending}
              onClick={() => {
                setStatus(value);
                statusAction.run(() => saveIdeaStatus({ ideaId, status: value }));
              }}
              className={`rounded-lg border px-3 py-1.5 text-sm ${currentStatus === value ? "border-neutral-900 font-medium dark:border-neutral-100" : "border-neutral-300 dark:border-neutral-700"}`}
            >
              {{ open: "Open", filled: "Filled", archived: "Archived" }[value]}
            </button>
          ))}
          <Outcome result={statusAction.result} />
        </div>
      </section>
    </div>
  );
}
