import { Heart, X } from "lucide-react";
import { answerCard, answerMatch } from "@/app/actions/respond";
import { buttonClass } from "@/components/ui/Button";

const round =
  "inline-flex size-10 items-center justify-center rounded-full transition active:scale-95";

/** Interested / Pass for a board card, as a plain form (no JavaScript needed). */
export function CardAnswerButtons({
  kind,
  targetId,
  returnTo,
}: {
  kind: "person" | "idea";
  targetId: string;
  returnTo: string;
}) {
  return (
    <form action={answerCard} className="flex gap-2">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="targetId" value={targetId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        type="submit"
        name="response"
        value="interested"
        className={buttonClass("primary", "sm")}
      >
        <Heart aria-hidden="true" className="size-4" /> Interested
      </button>
      <button type="submit" name="response" value="pass" className={buttonClass("secondary", "sm")}>
        Pass
      </button>
    </form>
  );
}

/** ✕ / ♥ for a match waiting on you, on /matches. */
export function MatchAnswerButtons({ matchId }: { matchId: string }) {
  return (
    <form action={answerMatch} className="flex shrink-0 gap-2">
      <input type="hidden" name="matchId" value={matchId} />
      <button
        type="submit"
        name="response"
        value="pass"
        aria-label="Pass"
        title="Pass"
        className={`${round} bg-surface-2 text-ink`}
      >
        <X aria-hidden="true" className="size-5" />
      </button>
      <button
        type="submit"
        name="response"
        value="interested"
        aria-label="Interested"
        title="Interested"
        className={`${round} bg-accent text-accent-ink`}
      >
        <Heart aria-hidden="true" className="size-5" />
      </button>
    </form>
  );
}
