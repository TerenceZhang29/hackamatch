/**
 * Fills the local database with 60 realistic fake users (25 of them with an
 * idea) for developing and testing matching, and embeds the users from
 * supabase/seed.sql. Uses the fake LLM and embedder; refuses to run against
 * anything but a local Supabase. Safe to re-run: existing users are skipped.
 *
 *   pnpm db:reset && pnpm seed:dev
 */
import { getConfig } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/service";
import { importPhase0 } from "@/server/phase0-import";
import { embedUserAndIdeas } from "@/server/profiles";

const FIRST = [
  "Ava",
  "Ben",
  "Chloe",
  "Dev",
  "Ema",
  "Felix",
  "Grace",
  "Hiro",
  "Isla",
  "Jon",
  "Kai",
  "Lila",
  "Mo",
  "Nina",
  "Owen",
  "Pia",
  "Quinn",
  "Rosa",
  "Sam",
  "Tara",
];
const LAST = [
  "Adams",
  "Bose",
  "Cruz",
  "Diaz",
  "Engel",
  "Fong",
  "Gupta",
  "Haas",
  "Ito",
  "Jain",
  "Kim",
  "Lopez",
  "Mehta",
  "Novak",
  "Okafor",
  "Park",
];

const IDEAS = [
  "A mobile app that helps nurses swap shifts with a backend for hospital rules",
  "A tool that turns lecture recordings into flashcards using machine learning",
  "A marketplace for restaurants to sell surplus food at closing time",
  "A dashboard that tracks campus energy use with data visualization",
  "A chatbot that answers course FAQs using an LLM over the syllabus",
  "An app that matches students for study groups by schedule",
  "A browser extension that summarizes legal terms of service",
  "A platform for local nonprofits to find student volunteers",
  "A fintech app that splits rent and utilities between roommates",
  "A mental health check-in app for grad students",
  "A hardware sensor network that maps air quality around campus",
  "A tool that helps small shops forecast inventory with data science",
  "An AR app that guides visitors around Roosevelt Island",
];
const BUILDERS = [
  "I build React and Next.js frontends",
  "I write Python backends and data pipelines",
  "iOS developer, Swift and SwiftUI",
  "Android developer working in Kotlin",
  "ML engineer with PyTorch experience",
  "Product designer, Figma prototypes and user research",
  "Full stack with TypeScript, Node.js and Postgres",
  "Data scientist, pandas and SQL, some machine learning",
  "Hardware hacker with Arduino and embedded C",
  "Backend engineer in Go, building APIs",
];
const AREAS = ["health", "climate", "fintech", "edtech", "civic", "social"];
const INTENTS = ["hackathon partner", "side project", "co-founder"];
const EVENTS = ["Cornell Tech Fall Hack", "Health AI Buildathon"];

/** A small deterministic PRNG (mulberry32), so every run seeds the same data. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const csvCell = (value: string) => `"${value.replaceAll('"', '""')}"`;

function devSignups(count: number): string {
  const next = random(29);
  const pick = <T>(list: readonly T[]) => list[Math.floor(next() * list.length)]!;
  const rows = ["email,name,role,intents,sentence,github_url,linkedin_url,events,submitted_at"];
  for (let i = 1; i <= count; i++) {
    // 25 idea people, 25 builders, 10 both.
    const role = i <= 25 ? "idea" : i <= 50 ? "builder" : "both";
    const area = pick(AREAS);
    const sentence =
      role === "idea"
        ? `${pick(IDEAS)}, focused on ${area}`
        : role === "builder"
          ? `${pick(BUILDERS)}; I like ${area} projects`
          : // Two sentences, idea first, as a student would write it; the pitch is the idea.
            `${pick(IDEAS)}. ${pick(BUILDERS)}.`;
    const intents = INTENTS.filter(() => next() < 0.5);
    const events = EVENTS.filter(() => next() < 0.4);
    rows.push(
      [
        `dev-${String(i).padStart(3, "0")}@cornell.edu`,
        `${pick(FIRST)} ${pick(LAST)}`,
        role,
        (intents.length ? intents : ["hackathon partner"]).join("; "),
        sentence,
        "",
        "",
        events.join("; "),
        "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return rows.join("\n");
}

async function main() {
  const config = getConfig();
  const host = new URL(config.NEXT_PUBLIC_SUPABASE_URL).hostname;
  if (!["127.0.0.1", "localhost"].includes(host)) {
    throw new Error(`seed:dev only runs against a local Supabase, not ${host}`);
  }
  if (config.LLM_PROVIDER !== "fake" || config.EMBEDDINGS_PROVIDER !== "fake") {
    throw new Error(
      "seed:dev uses the fake LLM and embedder; set LLM_PROVIDER=fake and EMBEDDINGS_PROVIDER=fake",
    );
  }

  const summary = await importPhase0({ signupsCsv: devSignups(60), dryRun: false });
  console.log(
    `Dev users: ${summary.signups.created} created, ${summary.signups.skipped} already there, ${summary.signups.errors.length} errors`,
  );

  // Users from supabase/seed.sql have tags but no embeddings.
  const supabase = createServiceClient();
  const { data: unembedded, error } = await supabase
    .from("profiles")
    .select("user_id, users!inner(onboarded_at)")
    .is("embedding", null)
    .not("users.onboarded_at", "is", null);
  if (error) throw new Error(error.message);
  for (const row of unembedded) await embedUserAndIdeas(row.user_id);
  console.log(`Embedded ${unembedded.length} more profile(s) and their ideas.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
