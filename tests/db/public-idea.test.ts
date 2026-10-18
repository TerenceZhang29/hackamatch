import { describe, expect, it } from "vitest";
import { setupTestDb } from "./helpers";

const db = setupTestDb();

async function ownerWithIdea(email: string, status = "open") {
  const owner = await db.createAuthUser(email, { onboarded: true });
  const { rows } = await db.asPostgres<{ id: string }>(
    `insert into public.ideas (owner_id, raw_text, pitch, status)
     values ($1, 'The secret full text', 'Public pitch', $2) returning id`,
    [owner, status],
  );
  return { owner, ideaId: rows[0]!.id };
}

describe("public_idea", () => {
  it("returns public fields and never raw_text, to logged-out visitors", async () => {
    const { ideaId, owner } = await ownerWithIdea("db-501@cornell.edu");
    const { rows, fields } = await db.asAnon("select * from public.public_idea($1)", [ideaId]);
    expect(rows).toHaveLength(1);
    expect(fields.map((f) => f.name)).not.toContain("raw_text");
    expect(JSON.stringify(rows[0])).not.toContain("secret");
    expect(rows[0]).toMatchObject({ pitch: "Public pitch", owner_id: owner, status: "open" });
  });

  it("shows filled ideas but hides archived ones", async () => {
    const filled = await ownerWithIdea("db-502@cornell.edu", "filled");
    const archived = await ownerWithIdea("db-503@cornell.edu", "archived");
    expect(
      (await db.asAnon("select id from public.public_idea($1)", [filled.ideaId])).rowCount,
    ).toBe(1);
    expect(
      (await db.asAnon("select id from public.public_idea($1)", [archived.ideaId])).rowCount,
    ).toBe(0);
  });

  it("hides ideas of paused owners", async () => {
    const { owner, ideaId } = await ownerWithIdea("db-504@cornell.edu");
    await db.asPostgres(
      "update public.users set paused_until = now() + interval '1 day' where id = $1",
      [owner],
    );
    expect((await db.asAnon("select id from public.public_idea($1)", [ideaId])).rowCount).toBe(0);
  });
});
