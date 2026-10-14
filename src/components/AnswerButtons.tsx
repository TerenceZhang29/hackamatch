import { answerCard, answerMatch } from "@/app/actions/respond";

const primary =
  "rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900";
const secondary =
  "rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700";

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
      <button type="submit" name="response" value="interested" className={primary}>
        Interested
      </button>
      <button type="submit" name="response" value="pass" className={secondary}>
        Pass
      </button>
    </form>
  );
}

/** Interested / Pass for a match on /matches. */
export function MatchAnswerButtons({ matchId }: { matchId: string }) {
  return (
    <form action={answerMatch} className="flex gap-2">
      <input type="hidden" name="matchId" value={matchId} />
      <button type="submit" name="response" value="interested" className={primary}>
        Interested
      </button>
      <button type="submit" name="response" value="pass" className={secondary}>
        Pass
      </button>
    </form>
  );
}
