import { describe, expect, it } from "vitest";
import { DEMO_PEOPLE } from "../../scripts/demo/data";
import { DEMO_REMOVE_SQL, demoEmail, demoSeedSql } from "@/lib/demo-seed";
import { slugsOf } from "@/lib/taxonomy/skills";

const sql = demoSeedSql(DEMO_PEOPLE);

describe("demo seed SQL", () => {
  it("uses only reserved .invalid addresses, never in auth.users", () => {
    expect(sql).not.toMatch(/@cornell\.edu/);
    const addresses = sql.match(/[\w.-]+@[\w.-]+/g) ?? [];
    expect(addresses.length).toBe(DEMO_PEOPLE.length);
    for (const address of addresses) expect(address).toMatch(/^demo-\d{3}@hackamatch\.invalid$/);
    // auth.users gets no email at all, so Supabase Auth can't send a sign-in link.
    expect(sql.match(/'authenticated', 'authenticated', null,/g)).toHaveLength(DEMO_PEOPLE.length);
    expect(demoEmail(7)).toBe("demo-007@hackamatch.invalid");
  });

  it("marks every person demo, with email off and sign-in banned", () => {
    expect(sql.match(/is_demo = true, notify_channel = 'none'/g)).toHaveLength(DEMO_PEOPLE.length);
    expect(sql.match(/'9999-01-01'/g)).toHaveLength(DEMO_PEOPLE.length);
    // One statement, so `supabase db query -f` runs it atomically.
    expect(sql).toMatch(/^do \$demo\$$/m);
    expect(sql).toMatch(/perform set_config\('hackamatch\.demo_seed', 'on', true\);/);
    expect(sql.trim().endsWith("$demo$;")).toBe(true);
    expect(sql.split("$demo$").length).toBe(3);
  });

  it("can be re-run safely", () => {
    const inserts = sql.match(/^insert into /gm)!.length;
    const guarded = sql.match(/on conflict (\(id\) )?do nothing;/g)!.length;
    expect(guarded).toBe(inserts);
  });

  it("removes only demo profiles", () => {
    expect(DEMO_REMOVE_SQL).toContain(
      "delete from auth.users where id in (select id from public.users where is_demo);",
    );
  });
});

describe("demo data", () => {
  const valid = {
    skills: new Set(slugsOf("skills")),
    stack: new Set(slugsOf("stack")),
    domains: new Set(slugsOf("domains")),
  };

  it("uses only taxonomy tags, and every idea person has an idea", () => {
    for (const person of DEMO_PEOPLE) {
      for (const tag of person.skills)
        expect(valid.skills, `${person.name}: ${tag}`).toContain(tag);
      for (const tag of person.stack) expect(valid.stack, `${person.name}: ${tag}`).toContain(tag);
      for (const tag of person.domains)
        expect(valid.domains, `${person.name}: ${tag}`).toContain(tag);
      if (person.role !== "builder") expect(person.ideas?.length, person.name).toBeGreaterThan(0);
      for (const idea of person.ideas ?? []) {
        expect(valid.domains, idea.pitch).toContain(idea.domain);
        for (const tag of idea.skillsNeeded) expect(valid.skills, idea.pitch).toContain(tag);
        expect(idea.pitch.split(/\s+/).length, idea.pitch).toBeLessThanOrEqual(20);
      }
    }
  });
});
