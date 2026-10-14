import { NextResponse, type NextRequest } from "next/server";
import { isProtectedPath, loginPath } from "@/lib/auth-helpers";
import { contentSecurityPolicy } from "@/lib/csp";
import { getPublicConfig } from "@/lib/public-config";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // A fresh nonce per request; Next.js reads it from the request's CSP header.
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy({
    nonce,
    supabaseUrl: getPublicConfig().supabaseUrl,
    dev: process.env.NODE_ENV === "development",
    https: request.nextUrl.protocol === "https:",
  });
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);

  const { response, userId } = await updateSession(request);

  const { pathname, search } = request.nextUrl;
  if (!userId && isProtectedPath(pathname)) {
    const redirect = NextResponse.redirect(new URL(loginPath(`${pathname}${search}`), request.url));
    // Keep any cookies the session refresh set (e.g. clearing an expired session).
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Skip static assets and image optimization.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
