import { requireAdmin } from "@/lib/auth";
import { getPilotAccess } from "@/server/pilot";
import { addPilotAccess, removePilotAccess, togglePilotOnly } from "../actions";
import { AdminShell, Notice, ScrollTable, button, input, shortDate, table, td, th } from "../ui";

/** The pilot's sign-up gate: an on/off switch and the netIDs allowed to join. */
export default async function AdminPilot({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin("/admin/pilot");
  const params = await searchParams;
  const { pilotOnly, rows } = await getPilotAccess();
  return (
    <AdminShell title="Pilot access">
      <Notice params={params} />
      <section aria-labelledby="gate" className="flex flex-col gap-2">
        <h2 id="gate" className="text-lg font-semibold">
          Sign-up gate: {pilotOnly ? "on" : "off"}
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {pilotOnly
            ? "Only the netIDs below can create an account. Everyone who already has one can still sign in."
            : "Anyone with a Cornell email can create an account."}
        </p>
        <form action={togglePilotOnly}>
          <input type="hidden" name="value" value={String(!pilotOnly)} />
          <button type="submit" className={button}>
            {pilotOnly ? "Turn the gate off" : "Turn the gate on"}
          </button>
        </form>
      </section>

      <section aria-labelledby="add" className="flex flex-col gap-2">
        <h2 id="add" className="text-lg font-semibold">
          Add netIDs
        </h2>
        <form action={addPilotAccess} className="flex flex-col gap-2">
          <label htmlFor="netids" className="text-sm">
            NetIDs or Cornell emails, separated by spaces, commas or new lines
          </label>
          <textarea id="netids" name="netids" rows={4} required className={input} />
          <button type="submit" className={`${button} self-start`}>
            Add
          </button>
        </form>
      </section>

      <section aria-labelledby="list" className="flex flex-col gap-2">
        <h2 id="list" className="text-lg font-semibold">
          Allowed netIDs ({rows.length})
        </h2>
        {rows.length ? (
          <ScrollTable label="Allowed netIDs">
            <table className={table}>
              <thead>
                <tr>
                  <th className={th}>NetID</th>
                  <th className={th}>Added</th>
                  <th className={th}>Signed up</th>
                  <th className={th}>
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.netid} aria-label={row.netid}>
                    <td className={td}>{row.netid}</td>
                    <td className={td}>{shortDate(row.addedAt)}</td>
                    <td className={td}>{row.signedUp ? "Yes" : "Not yet"}</td>
                    <td className={td}>
                      <form action={removePilotAccess}>
                        <input type="hidden" name="netid" value={row.netid} />
                        <button type="submit" className={button} aria-label={`Remove ${row.netid}`}>
                          Remove
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
        ) : (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">No netIDs yet.</p>
        )}
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Removing a netID stops a new sign-up only. An account already made keeps working; pause it
          in Users if needed.
        </p>
      </section>
    </AdminShell>
  );
}
