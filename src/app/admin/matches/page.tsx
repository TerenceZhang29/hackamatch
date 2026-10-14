import { requireAdmin } from "@/lib/auth";
import { listAllMatches, listEvents, listIdeas, listMatchableUsers } from "@/server/admin";
import { createMatchAction } from "../actions";
import { AdminShell, ScrollTable, button, input, Notice, shortDate, table, td, th } from "../ui";

export default async function AdminMatches({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin("/admin/matches");
  const [matches, users, ideas, events, params] = await Promise.all([
    listAllMatches(),
    listMatchableUsers(),
    listIdeas(),
    listEvents(),
    searchParams,
  ]);
  const label = (u: { name: string | null; cornell_email: string }) =>
    u.name ? `${u.name} <${u.cornell_email}>` : u.cornell_email;

  return (
    <AdminShell title="Matches">
      <Notice params={params} />
      <h2 className="text-lg font-semibold">Match two people by hand</h2>
      <form action={createMatchAction} className="grid max-w-3xl gap-3 sm:grid-cols-2">
        <datalist id="people">
          {users.map((user) => (
            <option key={user.id} value={label(user)} />
          ))}
        </datalist>
        <label className="flex flex-col gap-1 text-sm">
          Person A
          <input name="emailX" list="people" required className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Person B
          <input name="emailY" list="people" required className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Why, for A (shown to A)
          <input name="reasonForX" maxLength={200} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Why, for B (shown to B)
          <input name="reasonForY" maxLength={200} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Idea (optional)
          <select name="ideaId" defaultValue="" className={input}>
            <option value="">None</option>
            {ideas
              .filter((idea) => idea.status === "open")
              .map((idea) => (
                <option key={idea.id} value={idea.id}>
                  {(idea.pitch ?? idea.rawText).slice(0, 80)}
                </option>
              ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Event (optional)
          <select name="eventId" defaultValue="" className={input}>
            <option value="">None</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
        </label>
        <div>
          <button type="submit" className={button}>
            Create match and email both
          </button>
        </div>
      </form>

      <h2 className="text-lg font-semibold">All matches</h2>
      <ScrollTable label="All matches">
        <table className={table}>
          <thead>
            <tr>
              <th className={th}>Created</th>
              <th className={th}>Source</th>
              <th className={th}>A</th>
              <th className={th}>B</th>
              <th className={th}>Mutual</th>
              <th className={th}>Teamed up</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((match) => (
              <tr key={match.id} aria-label={`${match.aEmail} and ${match.bEmail}`}>
                <td className={td}>{shortDate(match.createdAt)}</td>
                <td className={td}>{match.source}</td>
                <td className={td}>
                  {match.aEmail}
                  <br />
                  <span className="text-neutral-500">{match.aResponse}</span>
                </td>
                <td className={td}>
                  {match.bEmail}
                  <br />
                  <span className="text-neutral-500">{match.bResponse}</span>
                </td>
                <td className={td}>{shortDate(match.revealedAt)}</td>
                <td className={td}>{shortDate(match.teamedUpAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollTable>
    </AdminShell>
  );
}
