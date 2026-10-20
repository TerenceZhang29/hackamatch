import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/** The pilot's sign-up gate (docs/plans/pilot-access.md). */

/**
 * May this address sign in? True when the gate is off, the address already has
 * an account, or its netID is on the list. On a database error it answers
 * true: the trigger on public.users still refuses an unlisted sign-up.
 */
export async function pilotCanSignIn(email: string): Promise<boolean> {
  const { data, error } = await createServiceClient().rpc("pilot_can_sign_in", {
    p_email: email,
  });
  if (error) {
    console.error("pilot_can_sign_in failed", error.message);
    return true;
  }
  return data;
}

export interface PilotAccessRow {
  netid: string;
  addedAt: string;
  signedUp: boolean;
}

/** Callers must have checked `requireAdmin()`. */
export async function getPilotAccess(): Promise<{ pilotOnly: boolean; rows: PilotAccessRow[] }> {
  const supabase = createServiceClient();
  const [settings, list] = await Promise.all([
    supabase.from("app_settings").select("pilot_only").single(),
    supabase.from("pilot_access").select("netid, added_at").order("netid"),
  ]);
  if (settings.error) throw new Error(`getPilotAccess: ${settings.error.message}`);
  if (list.error) throw new Error(`getPilotAccess: ${list.error.message}`);

  const emails = list.data.map((row) => `${row.netid}@cornell.edu`);
  const { data: users, error } = emails.length
    ? await supabase.from("users").select("cornell_email").in("cornell_email", emails)
    : { data: [], error: null };
  if (error) throw new Error(`getPilotAccess: ${error.message}`);
  const signedUp = new Set(users.map((u) => u.cornell_email.toLowerCase()));

  return {
    pilotOnly: settings.data.pilot_only,
    rows: list.data.map((row) => ({
      netid: row.netid,
      addedAt: row.added_at,
      signedUp: signedUp.has(`${row.netid}@cornell.edu`),
    })),
  };
}

export async function setPilotOnly(pilotOnly: boolean) {
  const { error } = await createServiceClient()
    .from("app_settings")
    .update({ pilot_only: pilotOnly, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) throw new Error(`setPilotOnly: ${error.message}`);
}

export async function addPilotNetIds(netIds: string[]) {
  if (!netIds.length) return;
  const { error } = await createServiceClient()
    .from("pilot_access")
    .upsert(
      netIds.map((netid) => ({ netid })),
      { onConflict: "netid", ignoreDuplicates: true },
    );
  if (error) throw new Error(`addPilotNetIds: ${error.message}`);
}

export async function removePilotNetId(netid: string) {
  const { error } = await createServiceClient().from("pilot_access").delete().eq("netid", netid);
  if (error) throw new Error(`removePilotNetId: ${error.message}`);
}
