/**
 * P1-15: every canonical analytics event must be emitted somewhere in the app.
 * Looks for each event name as a string literal in src/ (outside the file that
 * defines the list) and fails if one is never used.
 *
 * Run: node scripts/check-analytics.mts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DEFINITION = path.join(ROOT, "src/lib/analytics.ts");

/**
 * Events that belong to later phases, with the ticket that will emit them.
 * Remove an entry when that ticket lands.
 */
const NOT_YET: Record<string, string> = {
  digest_sent: "P2-06 (daily digest email)",
};

function eventNames(): string[] {
  const source = readFileSync(DEFINITION, "utf8");
  const list = /ANALYTICS_EVENTS = \[([\s\S]*?)\] as const/.exec(source)?.[1];
  if (!list) throw new Error("Could not find ANALYTICS_EVENTS in src/lib/analytics.ts");
  return [...list.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]!);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) && full !== DEFINITION ? [full] : [];
  });
}

const code = sourceFiles(path.join(ROOT, "src"))
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

const missing: string[] = [];
const waiting: string[] = [];
for (const name of eventNames()) {
  const used = code.includes(`"${name}"`);
  if (used && NOT_YET[name]) {
    console.error(
      `"${name}" is emitted now; remove it from NOT_YET in scripts/check-analytics.mts`,
    );
    process.exitCode = 1;
  } else if (!used && NOT_YET[name]) {
    waiting.push(`${name} (${NOT_YET[name]})`);
  } else if (!used) {
    missing.push(name);
  }
}

if (waiting.length) console.log(`Not emitted yet, by plan: ${waiting.join(", ")}`);
if (missing.length) {
  console.error(`Analytics events never emitted: ${missing.join(", ")}`);
  process.exitCode = 1;
} else if (!process.exitCode) {
  console.log("Every analytics event is emitted.");
}
