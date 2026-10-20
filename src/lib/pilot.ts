/**
 * The pilot's sign-up gate (docs/plans/pilot-access.md). Pure helpers, shared
 * by the login action and /admin/pilot.
 */

/** Shown when a new address isn't on the pilot list. */
export const PILOT_DENIED = "No access for the pilot test. Please contact the admin.";

const NETID = /^[a-z0-9-]{2,40}$/;

/**
 * Reads netIDs pasted into the admin form: separated by spaces, commas,
 * semicolons or new lines, as bare netIDs or full Cornell addresses. Returns
 * the valid ones (lowercased, deduplicated) and the entries it couldn't read.
 */
export function parseNetIds(text: string): { netIds: string[]; invalid: string[] } {
  const netIds = new Set<string>();
  const invalid: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const entry = raw.trim().toLowerCase();
    if (!entry) continue;
    const [local, domain] = entry.split("@");
    if (local && NETID.test(local) && (domain === undefined || domain === "cornell.edu")) {
      netIds.add(local);
    } else {
      invalid.push(raw.trim());
    }
  }
  return { netIds: [...netIds], invalid };
}
