import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { loginPath } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/db";

export type AppUser = Tables<"users">;

const LAST_ACTIVE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * The signed-in user's `users` row, or null when logged out. Cached for the
 * duration of one request, so pages and the helpers below can call it freely.
 */
export const getUser = cache(async (): Promise<AppUser | null> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;
  if (!userId) return null;

  const { data: user } = await supabase.from("users").select("*").eq("id", userId).maybeSingle();
  if (!user) return null;

  // Touch last_active_at at most once per hour: compare before writing, and
  // repeat the comparison in the update so concurrent requests write once.
  const now = Date.now();
  if (now - new Date(user.last_active_at).getTime() > LAST_ACTIVE_INTERVAL_MS) {
    const { error } = await supabase
      .from("users")
      .update({ last_active_at: new Date(now).toISOString() })
      .eq("id", user.id)
      .lt("last_active_at", new Date(now - LAST_ACTIVE_INTERVAL_MS).toISOString());
    if (error) console.error("Failed to update last_active_at", error.message);
  }

  return user;
});

/**
 * Requires a signed-in user; otherwise redirects to `/login`. Pass the current
 * path as `next` so the user comes back after signing in.
 */
export async function requireUser(next?: string): Promise<AppUser> {
  const user = await getUser();
  if (!user) redirect(loginPath(next));
  return user;
}

/** Requires a user who has finished onboarding; otherwise sends them there. */
export async function requireOnboarded(next?: string): Promise<AppUser> {
  const user = await requireUser(next);
  if (!user.onboarded_at) redirect("/onboarding");
  return user;
}

/** Requires an admin. Everyone else gets a 404, so admin pages stay hidden. */
export async function requireAdmin(next?: string): Promise<AppUser> {
  const user = await requireUser(next);
  if (!user.is_admin) notFound();
  return user;
}

/** Requires an organizer (admins count). Everyone else gets a 404. */
export async function requireOrganizer(next?: string): Promise<AppUser> {
  const user = await requireUser(next);
  if (!user.is_organizer && !user.is_admin) notFound();
  return user;
}
