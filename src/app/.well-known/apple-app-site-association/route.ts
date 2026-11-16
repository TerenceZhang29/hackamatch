import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";

/**
 * Which hackamatch.com links open the iOS app when it is installed
 * (universal links, docs/plans/ios-app.md, phase 5): event pages, matches,
 * and sign-in links the app itself asked for (`via=app`). Sign-in links from
 * the website, and the one-click /r/ links, stay in the browser.
 * Apple fetches this once per install through its CDN; it must not redirect.
 */
export function GET() {
  const { APNS_TEAM_ID, APNS_BUNDLE_ID } = getConfig();
  return NextResponse.json(
    {
      applinks: {
        details: [
          {
            appIDs: [`${APNS_TEAM_ID}.${APNS_BUNDLE_ID}`],
            components: [
              {
                "/": "/auth/confirm",
                "?": { via: "app" },
                comment: "Sign-in links the app asked for",
              },
              { "/": "/e/*", comment: "Event pages" },
              { "/": "/matches", comment: "The matches list" },
              { "/": "/matches/*", comment: "A match" },
            ],
          },
        ],
      },
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
