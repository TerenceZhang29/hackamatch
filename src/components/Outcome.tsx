const MESSAGES: Record<string, string> = {
  sent: "Sent. If they're interested too, we'll email you both each other's contact details.",
  passed: "Passed. You won't see them again.",
  matched: "It's a match! We've emailed you both each other's contact details.",
  limit: "You've said Interested to 15 people today. Come back tomorrow.",
  unavailable: "That person or idea isn't available any more.",
  self: "That's you!",
};

type Params = Record<string, string | string[] | undefined>;

/** The banner after an Interested / Pass redirect (`?sent=1`, `?error=limit`, …). */
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
  return (
    <p
      role="status"
      className={`rounded-lg px-4 py-3 text-sm ${
        error
          ? "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
          : "bg-neutral-100 dark:bg-neutral-900"
      }`}
    >
      {message}
    </p>
  );
}
