"use client";

import { useRef, useState, useTransition } from "react";
import { autofillEventAction } from "../actions";
import { button, input } from "../ui";

/** Shown on every field the draft filled, until the admin edits it. */
const MARK = ["ring-2", "ring-amber-400"];

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/**
 * "Fill from event site" (P1-25), inside the event form: drafts the form from
 * the event's page, or from text pasted from it. It only fills fields that
 * are empty or still hold the previous draft, so the admin's own edits stay;
 * nothing is saved until they press Save.
 */
export function AutofillPanel() {
  const root = useRef<HTMLDivElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  // What the last draft put in each field, so a second draft can replace it.
  const lastFill = useRef(new Map<string, string>());
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  function fill() {
    const form = root.current?.closest("form");
    if (!form) return;
    const siteField = form.elements.namedItem("url") as HTMLInputElement | null;
    const url = urlRef.current?.value.trim() || siteField?.value.trim() || "";
    const text = textRef.current?.value ?? "";
    setMessage(null);
    startTransition(async () => {
      const result = await autofillEventAction({ url, text });
      if (!result.ok) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      let filled = 0;
      for (const [name, value] of Object.entries(result.values)) {
        if (Array.isArray(value)) {
          filled += fillCheckboxes(form, name, value);
          continue;
        }
        const field = form.elements.namedItem(name) as Field | null;
        if (!field || !("value" in field)) continue;
        const previous = lastFill.current.get(name);
        if (field.value.trim() && field.value !== previous) continue;
        field.value = value;
        lastFill.current.set(name, value);
        field.classList.add(...MARK);
        field.addEventListener("input", () => field.classList.remove(...MARK), { once: true });
        filled++;
      }
      if (siteField && !siteField.value && url) siteField.value = url;
      setMessage(
        filled
          ? {
              tone: "ok",
              text: `Filled ${filled} field${filled === 1 ? "" : "s"} from the event site (outlined). Check them before saving; empty ones weren't on the page.`,
            }
          : { tone: "ok", text: "Nothing new to fill: the fields already have values." },
      );
    });
  }

  /** Ticks the draft's boxes, unless the admin already ticked some in that group. */
  function fillCheckboxes(form: HTMLFormElement, name: string, values: string[]): number {
    const boxes = [
      ...form.querySelectorAll<HTMLInputElement>(`input[type=checkbox][name="${name}"]`),
    ];
    const ticked = boxes
      .filter((box) => box.checked)
      .map((box) => box.value)
      .sort()
      .join(",");
    if (ticked && ticked !== lastFill.current.get(name)) return 0;
    for (const box of boxes) box.checked = values.includes(box.value);
    lastFill.current.set(name, [...values].sort().join(","));
    return values.length ? 1 : 0;
  }

  return (
    <div
      ref={root}
      className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm sm:col-span-2 dark:border-amber-900 dark:bg-amber-950"
    >
      <p className="font-medium">Fill from event site</p>
      <p className="text-xs text-neutral-600 dark:text-neutral-400">
        Reads the event&apos;s page with AI and fills the fields below. Check them before saving.
        Uses the Website above unless you give another link.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          ref={urlRef}
          type="url"
          aria-label="Event page link"
          placeholder="https://… (optional)"
          className={`${input} min-w-0 flex-1`}
        />
        <button type="button" onClick={fill} disabled={pending} className={button}>
          {pending ? "Reading the page…" : "Fill from event site"}
        </button>
      </div>
      <details>
        <summary className="cursor-pointer text-xs">
          The site loads with JavaScript? Paste the page&apos;s text instead
        </summary>
        <textarea
          ref={textRef}
          rows={5}
          aria-label="Event page text"
          placeholder="Select all on the event's page, copy, and paste here"
          className={`${input} mt-2 w-full`}
        />
      </details>
      {message ? (
        <p
          role="status"
          className={
            message.tone === "error"
              ? "text-red-700 dark:text-red-400"
              : "text-neutral-700 dark:text-neutral-300"
          }
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
