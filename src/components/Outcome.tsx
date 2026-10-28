import { Notice } from "@/components/ui/Notice";

const MESSAGES: Record<string, { text: string; tone: "neutral" | "success" | "danger" }> = {
  sent: { text: "Sent", tone: "neutral" },
  passed: { text: "Passed", tone: "neutral" },
  matched: { text: "It's a match! Check your email.", tone: "success" },
  limit: { text: "That's 15 today. Back tomorrow.", tone: "danger" },
  unavailable: { text: "No longer available.", tone: "danger" },
  self: { text: "That's you!", tone: "danger" },
  busy: { text: "Too fast. Try again in a few minutes.", tone: "danger" },
  failed: { text: "That didn't save. Try again.", tone: "danger" },
};

type Params = Record<string, string | string[] | undefined>;

/** One short line after an Interested / Pass redirect (`?sent=1`, `?error=limit`, …). */
export function Outcome({ params }: { params: Params }) {
  const error = typeof params.error === "string" ? params.error : null;
  const key = error
    ? error
    : params.matched
      ? "matched"
      : params.sent
        ? "sent"
        : params.passed
          ? "passed"
          : null;
  const message = key ? MESSAGES[key] : null;
  if (!message) return null;
  return <Notice tone={message.tone}>{message.text}</Notice>;
}
