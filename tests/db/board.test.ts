import { describe, expect, it } from "vitest";
import { setupTestDb } from "./helpers";

const db = setupTestDb();

const MAYA = "00000000-0000-4000-a000-000000000101";
const SOFIA = "00000000-0000-4000-a000-000000000201";

describe("public_board_ideas filters", () => {
  const ideaPitches = async (args: string, params: unknown[] = []) =>
    (
      await db.asService<{ pitch: string }>(
        `select pitch from public.public_board_ideas(${args})`,
        params,
      )
    ).rows.map((r) => r.pitch);

  it("filters by domain, skill and the owner's intent", async () => {
    expect(await ideaPitches("p_domain => 'climate'")).toHaveLength(2);
    expect(await ideaPitches("p_skill => 'ml'")).toEqual([
      "Turn lecture recordings into flashcards automatically.",
    ]);
    // Only Amara (cofounder) and Omar (cofounder) list co-founder.
    expect((await ideaPitches("p_intent => 'cofounder'")).sort()).toEqual(
      [
        "A live air-quality map from cheap campus sensors.",
        "Help restaurants sell surplus food before closing.",
      ].sort(),
    );
  });

  it("leaves out excluded owners", async () => {
    const pitches = await ideaPitches("p_exclude_user_ids => $1", [[MAYA]]);
    expect(pitches).toHaveLength(4);
    expect(pitches).not.toContain("Let nurses swap shifts in minutes instead of days.");
  });
});

describe("public_board_people filters", () => {
  const names = async (args: string, params: unknown[] = []) =>
    (
      await db.asService<{ display_name: string }>(
        `select display_name from public.public_board_people(${args})`,
        params,
      )
    ).rows.map((r) => r.display_name);

  it("filters by event, skill (skills or stack), domain and intent", async () => {
    expect(
      (await names("p_role => 'builder', p_event_slug => 'cornell-tech-fall-hack'")).sort(),
    ).toEqual(["Omar B.", "Sofia C.", "Tom N."]);
    expect(await names("p_skill => 'react'")).toEqual(["Sofia C."]);
    expect(await names("p_skill => 'hardware'")).toEqual(["Omar B."]);
    expect((await names("p_domain => 'climate'")).sort()).toEqual(["Amara R.", "Omar B."]);
    expect(await names("p_role => 'builder', p_intent => 'cofounder'")).toEqual(
      expect.arrayContaining(["Ravi Y.", "Omar B."]),
    );
  });

  it("returns intents and leaves out excluded people", async () => {
    const { rows } = await db.asService<{ display_name: string; intents: string[] }>(
      "select display_name, intents::text[] from public.public_board_people(p_exclude_user_ids => $1)",
      [[SOFIA]],
    );
    expect(rows.map((r) => r.display_name)).not.toContain("Sofia C.");
    expect(rows.find((r) => r.display_name === "Maya P.")?.intents).toEqual([
      "hackathon",
      "side_project",
    ]);
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
