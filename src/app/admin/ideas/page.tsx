import { requireAdmin } from "@/lib/auth";
import { listIdeas } from "@/server/admin";
import { changeIdeaStatusAsAdmin, toggleFeatured } from "../actions";
import { AdminShell, button, shortDate, table, td, th } from "../ui";

export default async function AdminIdeas() {
  await requireAdmin("/admin/ideas");
  const ideas = await listIdeas();
  return (
    <AdminShell title="Ideas">
      <div className="overflow-x-auto">
        <table className={table}>
          <thead>
            <tr>
              <th className={th}>Idea</th>
              <th className={th}>Owner</th>
              <th className={th}>Posted</th>
              <th className={th}>Status</th>
              <th className={th}>Featured</th>
            </tr>
          </thead>
          <tbody>
            {ideas.map((idea) => (
              <tr key={idea.id} aria-label={idea.pitch ?? idea.rawText}>
                <td className={td}>
                  <span className="font-medium">{idea.pitch ?? "(no pitch yet)"}</span>
                  <br />
                  <span className="text-neutral-500">{idea.rawText}</span>
                </td>
                <td className={td}>{idea.ownerEmail}</td>
                <td className={td}>{shortDate(idea.createdAt)}</td>
                <td className={td}>
                  <form action={changeIdeaStatusAsAdmin} className="flex gap-1">
                    <input type="hidden" name="ideaId" value={idea.id} />
                    {(["open", "filled", "archived"] as const).map((status) => (
                      <button
                        key={status}
                        type="submit"
                        name="status"
                        value={status}
                        aria-pressed={idea.status === status}
                        className={`${button} ${idea.status === status ? "font-bold" : ""}`}
                      >
                        {status}
                      </button>
                    ))}
                  </form>
                </td>
                <td className={td}>
                  <form action={toggleFeatured}>
                    <input type="hidden" name="ideaId" value={idea.id} />
                    <input type="hidden" name="value" value={String(!idea.featured)} />
                    <button type="submit" className={button}>
                      {idea.featured ? "Unfeature" : "Feature"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
