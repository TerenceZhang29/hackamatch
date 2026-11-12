import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { NextResponse } from "next/server";
import type { AppUser } from "@/lib/auth";
import { getPublicConfig } from "@/lib/public-config";
import type { Database } from "@/types/db";
import { apiError } from "./http";

/**
 * Who is calling an `/api/v1` route: the iOS app sends its Supabase access
 * token as `Authorization: Bearer …`. Cookies are never read here, so a web
 * page can't make a signed-in call on a visitor's behalf and no origin check
 * is needed.
 */

const STATELESS = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
const LAST_ACTIVE_INTERVAL_MS = 60 * 60 * 1000;

/** A Supabase client with the public key and no stored session. */
export function anonClient() {
  const { supabaseUrl, supabaseAnonKey } = getPublicConfig();
  return createClient<Database>(supabaseUrl, supabaseAnonKey, { auth: STATELESS });
}

export function bearerToken(request: Request): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  return match?.[1] ?? null;
}

/**
 * The caller's `users` row, or null without a valid token. The token's
 * signature and expiry are checked first; the row is then read as that user,
 * so row-level security applies, as in `getUser()` for the web.
 */
export async function getApiUser(request: Request): Promise<AppUser | null> {
  const token = bearerToken(request);
  if (!token) return null;
  const { data: claims, error } = await anonClient().auth.getClaims(token);
  const userId = claims?.claims.sub;
  if (error || !userId) return null;

  const { supabaseUrl, supabaseAnonKey } = getPublicConfig();
  const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: STATELESS,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  // Gone when the account was deleted while its last token is still valid.
  const { data: user } = await supabase.from("users").select("*").eq("id", userId).maybeSingle();
  if (!user) return null;

  // Touch last_active_at at most once an hour, as getUser() does.
  const now = Date.now();
  if (now - new Date(user.last_active_at).getTime() > LAST_ACTIVE_INTERVAL_MS) {
    const { error: touchError } = await supabase
      .from("users")
      .update({ last_active_at: new Date(now).toISOString() })
      .eq("id", user.id)
      .lt("last_active_at", new Date(now - LAST_ACTIVE_INTERVAL_MS).toISOString());
    if (touchError) console.error("Failed to update last_active_at", touchError.message);
  }
  return user;
}

type Guard = { user: AppUser; response?: undefined } | { user?: undefined; response: NextResponse };

/** A signed-in caller, onboarded or not; otherwise the 401 to return. */
export async function requireApiUser(request: Request): Promise<Guard> {
  const user = await getApiUser(request);
  return user ? { user } : { response: apiError("unauthorized") };
}

/** A member (signed in and through sign-up); otherwise the 401 or 403 to return. */
export async function requireApiMember(request: Request): Promise<Guard> {
  const user = await getApiUser(request);
  if (!user) return { response: apiError("unauthorized") };
  return user.onboarded_at ? { user } : { response: apiError("not_onboarded") };
}
