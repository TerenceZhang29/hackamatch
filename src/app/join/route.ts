import { NextResponse, type NextRequest } from "next/server";
import { track } from "@/lib/analytics";
import { loginPath, sanitizeNext } from "@/lib/auth-helpers";
import { getUser } from "@/lib/auth";

/**
 * Entry point for every "join" and logged-out "Interested" link on public
 * pages: records `cta_clicked`, then sends the visitor to sign in (or straight
 * to `next` when they already are).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = sanitizeNext(params.get("next")) ?? "/onboarding";
  const from = (params.get("from") ?? "unknown").slice(0, 40);

  const user = await getUser();
  await track("cta_clicked", { from, next }, user?.id ?? null);

  const target = user ? (user.onboarded_at ? next : "/onboarding") : loginPath(next);
  return NextResponse.redirect(new URL(target, request.url), 303);
}
