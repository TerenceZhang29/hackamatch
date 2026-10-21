import { describe, expect, it } from "vitest";
import { setupTestDb } from "./helpers";

const db = setupTestDb();

async function ownerWithIdea(email: string) {
  const ownerId = await db.createAuthUser(email, { onboarded: true });
  const { rows } = await db.asPostgres<{ id: string }>(
    `insert into public.ideas (owner_id, raw_text, pitch) values ($1, 'Text', 'A pitch.') returning id`,
    [ownerId],
  );
  return { ownerId, ideaId: rows[0]!.id };
}

describe("public_board_ideas for two decks (P1-23)", () => {
  it("returns the owner's id", async () => {
    const { ownerId, ideaId } = await ownerWithIdea("db-961@cornell.edu");
    const { rows } = await db.asService<{ id: string; owner_id: string }>(
      "select id, owner_id from public.public_board_ideas(100, 0) where id = $1",
      [ideaId],
    );
    expect(rows).toEqual([{ id: ideaId, owner_id: ownerId }]);
  });

  it("leaves out passed ideas but keeps the owner's other ideas", async () => {
    const { ownerId, ideaId } = await ownerWithIdea("db-962@cornell.edu");
    const other = await db.asPostgres<{ id: string }>(
      `insert into public.ideas (owner_id, raw_text, pitch) values ($1, 'More', 'Another pitch.') returning id`,
      [ownerId],
    );
    const { rows } = await db.asService<{ id: string }>(
      "select id from public.public_board_ideas(100, 0, p_exclude_idea_ids => $1)",
      [[ideaId]],
    );
    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain(ideaId);
    expect(ids).toContain(other.rows[0]!.id);
  });

  it("is still server-only", async () => {
    for (const role of ["anon", "authenticated"]) {
      const { rows } = await db.asPostgres<{ ok: boolean }>(
        `select has_function_privilege($1,
           'public.public_board_ideas(int, int, text, text, text, public.user_intent, uuid[], uuid[])',
           'execute') as ok`,
        [role],
      );
      expect(rows[0]!.ok).toBe(false);
    }
  });
});

describe("card_passes", () => {
  it("is server-only: visitors and members can't read or write it", async () => {
    const userId = await db.createAuthUser("db-963@cornell.edu", { onboarded: true });
    const read = await db.expectError(() => db.asUser(userId, "select * from public.card_passes"));
    expect(read?.message).toMatch(/permission denied/);
    const write = await db.expectError(() =>
      db.asUser(
        userId,
        `insert into public.card_passes (user_id, kind, target_id) values ($1, 'idea', $1)`,
        [userId],
      ),
    );
    expect(write?.message).toMatch(/permission denied/);
    const anon = await db.expectError(() => db.asAnon("select * from public.card_passes"));
    expect(anon?.message).toMatch(/permission denied/);
  });

  it("keeps one row per card and goes when the user does", async () => {
    const userId = await db.createAuthUser("db-964@cornell.edu", { onboarded: true });
    const { ideaId } = await ownerWithIdea("db-965@cornell.edu");
    await db.asService(
      `insert into public.card_passes (user_id, kind, target_id) values ($1, 'idea', $2)`,
      [userId, ideaId],
    );
    const dup = await db.expectError(() =>
      db.asService(
        `insert into public.card_passes (user_id, kind, target_id) values ($1, 'idea', $2)`,
        [userId, ideaId],
      ),
    );
    expect(dup?.message).toMatch(/duplicate key/);
    await db.asPostgres("delete from auth.users where id = $1", [userId]);
    const { rows } = await db.asPostgres("select 1 from public.card_passes where user_id = $1", [
      userId,
    ]);
    expect(rows).toEqual([]);
  });
});
