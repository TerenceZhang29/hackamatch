import Link from "next/link";
import { getPairMatch, sideOf } from "@/server/matches";
import { CardAnswerButtons } from "./AnswerButtons";

/**
 * On an idea or person page: the viewer's standing with that person, or the
 * Interested / Pass buttons when there is no match yet. Never shows the other
 * person's answer before a reveal.
 */
export async function PairStatus({
  viewerId,
  otherId,
  kind,
  targetId,
  returnTo,
}: {
  viewerId: string;
  otherId: string;
  kind: "person" | "idea";
  targetId: string;
  returnTo: string;
}) {
  const match = await getPairMatch(viewerId, otherId);
  if (!match) return <CardAnswerButtons kind={kind} targetId={targetId} returnTo={returnTo} />;

  if (match.revealed_at) {
    return (
      <Link href={`/matches/${match.id}`} className="self-start text-sm font-medium underline">
        You matched. Open your match →
      </Link>
    );
  }
  const mine = sideOf(match, viewerId) === "a" ? match.a_response : match.b_response;
  if (mine === "pending") {
    return <CardAnswerButtons kind={kind} targetId={targetId} returnTo={returnTo} />;
  }
  return (
    <p className="text-sm text-muted">
      {mine === "interested"
        ? "You said you're interested. We'll email you both if it's mutual."
        : "You passed."}
    </p>
  );
}
