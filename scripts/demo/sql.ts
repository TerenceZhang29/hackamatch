/** Writes supabase/demo/seed.sql and remove.sql from scripts/demo/data.ts. */
import { writeFileSync } from "node:fs";
import { DEMO_REMOVE_SQL, demoSeedSql } from "../../src/lib/demo-seed";
import { DEMO_PEOPLE } from "./data";

writeFileSync("supabase/demo/seed.sql", demoSeedSql(DEMO_PEOPLE));
writeFileSync("supabase/demo/remove.sql", DEMO_REMOVE_SQL);
const ideas = DEMO_PEOPLE.reduce((n, p) => n + (p.ideas?.length ?? 0), 0);
console.log(
  `Wrote supabase/demo/seed.sql (${DEMO_PEOPLE.length} people, ${ideas} ideas) and remove.sql`,
);
