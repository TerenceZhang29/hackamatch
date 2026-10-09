import { NextResponse, type NextRequest } from "next/server";
import { isProtectedPath, loginPath } from "@/lib/auth-helpers";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { response, userId } = await updateSession(request);

  const { pathname, search } = request.nextUrl;
  if (!userId && isProtectedPath(pathname)) {
    const redirect = NextResponse.redirect(new URL(loginPath(`${pathname}${search}`), request.url));
    // Keep any cookies the session refresh set (e.g. clearing an expired session).
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  return response;
}

export const config = {
  // Skip static assets and image optimization.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
