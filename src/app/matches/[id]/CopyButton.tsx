"use client";

import { useState } from "react";

/** Copies text to the clipboard; the text stays selectable for browsers without clipboard access. */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
      className="self-start rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
