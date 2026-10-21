import { describe, expect, it } from "vitest";
import { setupTestDb } from "./helpers";

const db = setupTestDb();

/** An onboarded builder with one idea in the given status (P1-22 drafts). */
async function builderWithIdea(email: string, status: "draft" | "open") {
  const ownerId = await db.createAuthUser(email, { onboarded: true });
  const { rows } = await db.asPostgres<{ id: string }>(
    `insert into public.ideas (owner_id, raw_text, pitch, status)
     values ($1, 'A study-group finder for night owls', 'A study-group finder.', $2)
     returning id`,
    [ownerId, status],
  );
  return { ownerId, ideaId: rows[0]!.id };
}

describe("draft ideas", () => {
  it("stay off the board and the public idea page", async () => {
    const { ideaId } = await builderWithIdea("db-951@cornell.edu", "draft");
    const board = await db.asService<{ id: string }>(
      "select id from public.public_board_ideas(100, 0)",
    );
    expect(board.rows.map((r) => r.id)).not.toContain(ideaId);
    const page = await db.asService("select * from public.public_idea($1)", [ideaId]);
    expect(page.rows).toEqual([]);
  });

  it("show once posted", async () => {
    const { ideaId } = await builderWithIdea("db-952@cornell.edu", "draft");
    await db.asPostgres("update public.ideas set status = 'open' where id = $1", [ideaId]);
    const page = await db.asService<{ id: string }>("select id from public.public_idea($1)", [
      ideaId,
    ]);
    expect(page.rows).toEqual([{ id: ideaId }]);
  });

  it("are readable by their owner only", async () => {
    const { ownerId, ideaId } = await builderWithIdea("db-953@cornell.edu", "draft");
    const otherId = await db.createAuthUser("db-954@cornell.edu", { onboarded: true });
    const own = await db.asUser(ownerId, "select id from public.ideas where id = $1", [ideaId]);
    expect(own.rows).toHaveLength(1);
    const other = await db.asUser(otherId, "select id from public.ideas where id = $1", [ideaId]);
    expect(other.rows).toEqual([]);
  });

  it("public_idea still shows filled ideas but not archived ones", async () => {
    const { ideaId } = await builderWithIdea("db-955@cornell.edu", "open");
    await db.asPostgres("update public.ideas set status = 'filled' where id = $1", [ideaId]);
    expect(
      (await db.asService("select id from public.public_idea($1)", [ideaId])).rows,
    ).toHaveLength(1);
    await db.asPostgres("update public.ideas set status = 'archived' where id = $1", [ideaId]);
    expect((await db.asService("select id from public.public_idea($1)", [ideaId])).rows).toEqual(
      [],
    );
  });
});
