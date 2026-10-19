import { NextResponse, type NextRequest } from "next/server";
import { track } from "@/lib/analytics";
import { tokenSecret } from "@/server/notify";
import { verifyToken } from "@/lib/notify/tokens";
import { PAUSE_INDEFINITELY } from "@/lib/pause";
import { setPausedUntil } from "@/server/profiles";

/**
 * One-click unsubscribe (RFC 8058): mail clients POST here from the
 * List-Unsubscribe header. It pauses matches until the user turns them back
 * on. Only POST changes anything; a GET (a scanner, a preview) gets the
 * confirm page instead.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const verified = verifyToken(decodeURIComponent(token), tokenSecret());
  if (!verified.ok || verified.payload.action !== "pause") {
    return NextResponse.json({ error: "invalid or expired link" }, { status: 400 });
  }
  await setPausedUntil(verified.payload.userId, PAUSE_INDEFINITELY);
  await track(
    "paused",
    { choice: "indefinite", source: "list-unsubscribe" },
    verified.payload.userId,
  );
  return NextResponse.json({ ok: true });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  return NextResponse.redirect(new URL(`/r/${token}`, request.url), 303);
}
