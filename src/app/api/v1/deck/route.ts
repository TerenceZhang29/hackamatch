import { after } from "next/server";
import { track } from "@/lib/analytics";
import { requireApiMember } from "@/lib/api/auth";
import { apiJson } from "@/lib/api/http";
import { deckSchema } from "@/lib/api/schemas";
import { deckView } from "@/server/api-views";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Discover: the next person cards, optionally only people going to `?event=<slug>`. */
export async function GET(request: Request) {
  const { user, response } = await requireApiMember(request);
  if (!user) return response;
  const event = new URL(request.url).searchParams.get("event");
  // An unknown filter is ignored, as on the web.
  const eventSlug = event && SLUG.test(event) && event.length <= 80 ? event : null;

  after(() =>
    track(
      "board_viewed",
      { tab: "deck", filtered: eventSlug !== null, signed_in: true, client: "ios" },
      user.id,
    ),
  );
  return apiJson(deckSchema, await deckView(user.id, eventSlug));
}
