/**
 * Imports the Phase 0 spreadsheets. See docs/runbooks/import-phase0.md.
 *
 *   pnpm import:phase0 --signups data/phase0/signups.csv \
 *     --ideas data/phase0/seed_ideas.csv --matches data/phase0/matches.csv [--dry-run]
 *   pnpm import:phase0 --send-welcome --signups data/phase0/signups.csv
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parseCsv } from "@/lib/csv";
import { importPhase0, sendWelcomeLinks } from "@/server/phase0-import";

const { values } = parseArgs({
  options: {
    signups: { type: "string" },
    ideas: { type: "string" },
    matches: { type: "string" },
    "admin-email": { type: "string" },
    "dry-run": { type: "boolean", default: false },
    "send-welcome": { type: "boolean", default: false },
  },
});

const read = (path: string | undefined) => (path ? readFileSync(path, "utf8") : undefined);

async function main() {
  if (values["send-welcome"]) {
    if (!values.signups) throw new Error("--send-welcome needs --signups");
    const emails = parseCsv(read(values.signups)!, ["email"]).map((row) =>
      row.email!.toLowerCase(),
    );
    if (values["dry-run"]) {
      console.log(`Would send a sign-in link to ${emails.length} address(es).`);
      return;
    }
    const result = await sendWelcomeLinks(emails, console.log);
    console.table(result);
    return;
  }

  if (!values.signups && !values.ideas && !values.matches) {
    throw new Error("Pass at least one of --signups, --ideas, --matches");
  }
  const summary = await importPhase0({
    signupsCsv: read(values.signups),
    ideasCsv: read(values.ideas),
    matchesCsv: read(values.matches),
    adminEmail: values["admin-email"],
    dryRun: values["dry-run"],
    log: console.log,
  });

  console.log(values["dry-run"] ? "\nDry run: nothing was written.\n" : "\nImport finished.\n");
  console.table({
    signups: {
      created: summary.signups.created,
      skipped: summary.signups.skipped,
      errors: summary.signups.errors.length,
    },
    ideas: {
      created: summary.ideas.created,
      skipped: summary.ideas.skipped,
      errors: summary.ideas.errors.length,
    },
    matches: {
      created: summary.matches.created,
      skipped: summary.matches.skipped,
      errors: summary.matches.errors.length,
    },
  });
  console.log(`Teams: ${summary.teams}`);
  for (const [section, part] of Object.entries({
    signups: summary.signups,
    ideas: summary.ideas,
    matches: summary.matches,
  })) {
    for (const error of part.errors)
      console.log(`  ${section} line ${error.line}: ${error.message}`);
  }
  if (summary.unknownEvents.length) {
    console.log(
      `\nUnknown events (create them in /admin/events, then re-run): ${summary.unknownEvents.join(", ")}`,
    );
  }
  const errorCount =
    summary.signups.errors.length + summary.ideas.errors.length + summary.matches.errors.length;
  if (errorCount) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
