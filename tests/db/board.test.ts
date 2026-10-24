import { describe, expect, it } from "vitest";
import { setupTestDb } from "./helpers";

const db = setupTestDb();

const SOFIA = "00000000-0000-4000-a000-000000000201";

describe("public_board_people filters", () => {
  const names = async (args: string, params: unknown[] = []) =>
    (
      await db.asService<{ display_name: string }>(
        `select display_name from public.public_board_people(${args})`,
        params,
      )
    ).rows.map((r) => r.display_name);

  it("filters by event, skill (skills or stack) and domain, with no role filter (P1-24)", async () => {
    expect(await names("p_event_slug => 'cornell-tech-fall-hack'")).toEqual(
      expect.arrayContaining(["Jordan L.", "Maya P.", "Omar B.", "Sofia C.", "Tom N."]),
    );
    expect(await names("p_event_slug => 'cornell-tech-fall-hack'")).not.toContain("Amara R.");
    expect(await names("p_skill => 'react'")).toEqual(["Sofia C."]);
    expect(await names("p_skill => 'hardware'")).toEqual(["Omar B."]);
    expect((await names("p_domain => 'climate'")).sort()).toEqual(["Amara R.", "Omar B."]);
  });

  it("leaves out excluded people", async () => {
    const shown = await names("p_exclude_user_ids => $1", [[SOFIA]]);
    expect(shown).not.toContain("Sofia C.");
    expect(shown).toContain("Maya P.");
  });
});

describe("public_person", () => {
  it("returns one person's public card, or nothing when they are not in the pool", async () => {
    const { rows, fields } = await db.asService("select * from public.public_person($1)", [SOFIA]);
    expect(rows).toHaveLength(1);
    expect(fields.map((f) => f.name)).not.toContain("cornell_email");

    const paused = "00000000-0000-4000-a000-000000000302";
    expect((await db.asService("select * from public.public_person($1)", [paused])).rowCount).toBe(
      0,
    );
    const admin = "00000000-0000-4000-a000-000000000001";
    expect((await db.asService("select * from public.public_person($1)", [admin])).rowCount).toBe(
      0,
    );
  });
});
