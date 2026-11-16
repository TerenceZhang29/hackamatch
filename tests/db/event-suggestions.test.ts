import { describe, expect, it } from "vitest";
import { setupTestDb } from "./helpers";

const db = setupTestDb();

const insert = (overrides: Record<string, unknown> = {}) => {
  const row = {
    source: "mlh",
    name: "HackNYC",
    start_date: "2027-02-06",
    end_date: "2027-02-07",
    url: "https://hacknyc.example.org/",
    url_key: "hacknyc.example.org",
    status: "new",
    ...overrides,
  };
  const columns = Object.keys(row);
  return db.asService<{ id: string }>(
    `insert into public.event_suggestions (${columns.join(", ")})
     values (${columns.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    Object.values(row),
  );
};

describe("event_suggestions", () => {
  it("is server-only: visitors and members can't read or write it", async () => {
    const userId = await db.createAuthUser("db-701@cornell.edu", { onboarded: true });
    await insert();
    const read = await db.expectError(() =>
      db.asUser(userId, "select * from public.event_suggestions"),
    );
    expect(read?.message).toMatch(/permission denied/);
    const write = await db.expectError(() =>
      db.asUser(userId, `update public.event_suggestions set status = 'approved'`),
    );
    expect(write?.message).toMatch(/permission denied/);
    const anon = await db.expectError(() => db.asAnon("select * from public.event_suggestions"));
    expect(anon?.message).toMatch(/permission denied/);
  });

  it("holds one suggestion per page", async () => {
    await insert();
    const again = await db.expectError(() => insert({ source: "devpost", name: "HackNYC 2027" }));
    expect(again?.message).toMatch(/event_suggestions_url_key_key/);
  });

  it("checks the source, status, link and dates", async () => {
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ source: "eventbrite" }, /event_suggestions_source_check/],
      [{ status: "maybe" }, /event_suggestions_status_check/],
      [{ url: "http://hacknyc.example.org/" }, /event_suggestions_url_check/],
      [{ end_date: "2027-02-01" }, /event_suggestions_dates/],
      [{ format: "underwater" }, /invalid input value for enum/],
    ];
    for (const [overrides, error] of cases) {
      expect((await db.expectError(() => insert(overrides)))?.message).toMatch(error);
    }
  });

  it("links the event an admin made from it, and outlives that event", async () => {
    const adminId = await db.createAuthUser("db-702@cornell.edu", { onboarded: true });
    const {
      rows: [suggestion],
    } = await insert();
    const {
      rows: [event],
    } = await db.asService<{ id: string }>(
      `insert into public.events (slug, name, start_date, end_date)
       values ('hacknyc-db-702', 'HackNYC', '2027-02-06', '2027-02-07') returning id`,
    );
    await db.asService(
      `update public.event_suggestions
       set status = 'approved', event_id = $2, reviewed_at = now(), reviewed_by = $3
       where id = $1`,
      [suggestion!.id, event!.id, adminId],
    );
    await db.asPostgres("delete from public.events where id = $1", [event!.id]);
    const { rows } = await db.asPostgres(
      "select status, event_id, reviewed_by from public.event_suggestions where id = $1",
      [suggestion!.id],
    );
    expect(rows).toEqual([{ status: "approved", event_id: null, reviewed_by: adminId }]);
  });

  it("logs the admins' email in notification_log", async () => {
    const adminId = await db.createAuthUser("db-703@cornell.edu", { onboarded: true });
    await db.asService(
      `insert into public.notification_log (user_id, channel, kind, local_date)
       values ($1, 'email', 'event_suggestions', current_date)`,
      [adminId],
    );
    const { rows } = await db.asPostgres(
      "select kind from public.notification_log where user_id = $1",
      [adminId],
    );
    expect(rows).toEqual([{ kind: "event_suggestions" }]);
  });
});
