import { describe, expect, it } from "vitest";
import { setupTestDb } from "./helpers";

const db = setupTestDb();

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
    const personId = await db.createAuthUser("db-965@cornell.edu", { onboarded: true });
    await db.asService(
      `insert into public.card_passes (user_id, kind, target_id) values ($1, 'person', $2)`,
      [userId, personId],
    );
    const dup = await db.expectError(() =>
      db.asService(
        `insert into public.card_passes (user_id, kind, target_id) values ($1, 'person', $2)`,
        [userId, personId],
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
