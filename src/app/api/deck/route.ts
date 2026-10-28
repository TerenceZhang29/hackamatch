import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { DECK_DETAILS_WINDOW, passToken } from "@/lib/deck";
import { LIMITS } from "@/lib/rate-limit";
import { deckDetailsFor, undoDeckPass } from "@/server/deck";
import { answerFromBoard } from "@/server/matches";
import { allow } from "@/server/rate-limit";

/** What the deck's script gets back for an answer. */
export type DeckAnswer =
  | { ok: true; response: "pass"; passed: string }
  | { ok: true; response: "interested"; matchId: string | null }
  | { ok: false; error: string };

const bodySchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("answer"),
    targetId: z.guid(),
    response: z.enum(["interested", "pass"]),
  }),
  z.object({ op: z.literal("undo"), passed: z.string().max(80) }),
  z.object({ op: z.literal("details"), userIds: z.array(z.guid()).max(DECK_DETAILS_WINDOW) }),
]);

/**
 * The deck's script (DeckView): answers, Undo, and the details of the next
 * cards, without a page render, so the next card shows at once. A route, not
 * server actions: those run one at a time through the router, and a
 * navigation drops any still queued. Without JavaScript the deck posts its
 * forms to answerCard / undoPassAction instead.
 */
export async function POST(request: NextRequest) {
  // Only this site's own pages; the JSON body also rules out a plain cross-site form.
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const user = await getUser();
  if (!user?.onboarded_at) return NextResponse.json({ error: "signed out" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const body = parsed.data;

  if (body.op === "details") return NextResponse.json(await deckDetailsFor(user.id, body.userIds));

  if (!(await allow(LIMITS.answers, user.id))) {
    return NextResponse.json(
      body.op === "undo" ? { ok: false } : ({ ok: false, error: "busy" } satisfies DeckAnswer),
    );
  }
  if (body.op === "undo")
    return NextResponse.json({ ok: await undoDeckPass(user.id, body.passed) });

  const result = await answerFromBoard(
    user.id,
    { kind: "person", userId: body.targetId },
    body.response,
  );
  const answer: DeckAnswer = !result.ok
    ? { ok: false, error: result.error }
    : result.response === "pass"
      ? { ok: true, response: "pass", passed: passToken("person", body.targetId) }
      : { ok: true, response: "interested", matchId: result.revealed ? result.matchId : null };
  return NextResponse.json(answer);
}
