import { timingSafeEqual } from "node:crypto";
import { getConfig } from "@/lib/config";
import { discoverEvents } from "@/server/event-discovery";

/**
 * The weekly hackathon discovery job (docs/plans/event-discovery.md), called
 * by Vercel Cron on Mondays (vercel.json). Vercel sends
 * `Authorization: Bearer ${CRON_SECRET}`; anything else gets a 401. It only
 * stores suggestions for an admin to review; it never creates an event.
 */

export const dynamic = "force-dynamic";
// Reading the sources, then up to 15 model calls, three at a time.
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = getConfig().CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  try {
    const result = await discoverEvents({ dry });
    return Response.json({
      today: result.today,
      dry,
      sources: result.sources,
      fresh: result.fresh.map(({ source, name, startDate, endDate, url }) => ({
        source,
        name,
        startDate,
        endDate,
        url,
      })),
      drafted: result.drafted,
      stored: result.stored,
      emailed: result.emailed,
      usage: result.usage,
    });
  } catch (error) {
    console.error("cron discover-events", error);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
