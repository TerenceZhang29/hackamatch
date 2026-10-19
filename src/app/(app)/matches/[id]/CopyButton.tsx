"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { buttonClass } from "@/components/ui/Button";

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
      className={buttonClass("outline", "sm", "self-start")}
    >
      {copied ? (
        <Check aria-hidden="true" className="size-4" />
      ) : (
        <Copy aria-hidden="true" className="size-4" />
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
