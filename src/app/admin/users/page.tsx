import { requireAdmin } from "@/lib/auth";
import { isPaused } from "@/lib/pause";
import { listUsers } from "@/server/admin";
import { setUserPause, toggleOrganizer } from "../actions";
import { AdminShell, ScrollTable, button, input, shortDate, table, td, th } from "../ui";

export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin("/admin/users");
  const q = (await searchParams).q?.trim() || null;
  const users = await listUsers(q);
  return (
    <AdminShell title="Users">
      <form method="get" className="flex gap-2">
        <label htmlFor="q" className="sr-only">
          Search users
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Email or name"
          className={input}
        />
        <button type="submit" className={button}>
          Search
        </button>
      </form>
      <ScrollTable label="Users">
        <table className={table}>
          <thead>
            <tr>
              <th className={th}>User</th>
              <th className={th}>Role</th>
              <th className={th}>Intents</th>
              <th className={th}>Joined</th>
              <th className={th}>Last active</th>
              <th className={th}>Matches</th>
              <th className={th}>Paused</th>
              <th className={th}>Organizer</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const paused = isPaused(user.pausedUntil);
              return (
                <tr key={user.id} aria-label={user.email}>
                  <td className={td}>
                    {user.name ?? "–"}
                    <br />
                    <span className="text-neutral-500">{user.email}</span>
                    {user.isAdmin ? <span className="ml-1 text-xs">(admin)</span> : null}
                    {user.isDemo ? <span className="ml-1 text-xs">(demo)</span> : null}
                  </td>
                  <td className={td}>{user.role ?? "–"}</td>
                  <td className={td}>{user.intents.join(", ") || "–"}</td>
                  <td className={td}>{shortDate(user.onboardedAt)}</td>
                  <td className={td}>{shortDate(user.lastActiveAt)}</td>
                  <td className={td}>
                    {user.matches} ({user.mutual} mutual)
                  </td>
                  <td className={td}>
                    <form action={setUserPause}>
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="choice" value={paused ? "resume" : "indefinite"} />
                      <button type="submit" className={button}>
                        {paused ? "Unpause" : "Pause"}
                      </button>
                    </form>
                  </td>
                  <td className={td}>
                    <form action={toggleOrganizer}>
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="value" value={String(!user.isOrganizer)} />
                      <button type="submit" className={button}>
                        {user.isOrganizer ? "Remove organizer" : "Make organizer"}
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollTable>
    </AdminShell>
  );
}
