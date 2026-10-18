import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Test and seed accounts must use a `<use case>-<digits>` NetID (`ut-001`,
 * `db-201`, `e2e-…`, `seed-101`, `dev-001`, `p0-001`). Real Cornell NetIDs are
 * letters then digits, so these can never reach a real student's inbox.
 */
const ALLOWED = /^(ut|db|e2e|seed|dev|p0)-\d+$/i;
const ROOT = process.cwd();
const SCAN = ["tests", "scripts", "supabase/seed.sql"];
const EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".mjs", ".csv", ".sql", ".json"]);
const SELF = fileURLToPath(import.meta.url);

function files(entry: string): string[] {
  const full = path.join(ROOT, entry);
  if (statSync(full).isFile()) return [full];
  return readdirSync(full).flatMap((name) => {
    const child = path.join(entry, name);
    return statSync(path.join(ROOT, child)).isDirectory()
      ? files(child)
      : EXTENSIONS.has(path.extname(name))
        ? [path.join(ROOT, child)]
        : [];
  });
}

/** Every Cornell address in the text, with template expressions read as digits. */
function cornellLocalParts(text: string): string[] {
  // Escapes like "\n" in string literals would otherwise read as part of the address.
  const flattened = text.replaceAll(/\$\{[^}]*\}/g, "0").replaceAll(/\\[nrt]/g, " ");
  return [...flattened.matchAll(/([A-Za-z0-9._%+-]*)@cornell\.edu/gi)]
    .map((match) => match[1]!)
    .filter((local) => local !== "" && local !== "%");
}

describe("test addresses", () => {
  it("reads template expressions as digits", () => {
    expect(
      cornellLocalParts(
        "`db-4${pair}1@cornell.edu` 'ut-2@Cornell.EDU' '%@cornell.edu' 'a\\nut-3@cornell.edu'",
      ),
    ).toEqual(["db-401", "ut-2", "ut-3"]);
  });

  it("use a <use case>-<digits> NetID everywhere", () => {
    const offenders = SCAN.flatMap(files)
      .filter((file) => file !== SELF)
      .flatMap((file) =>
        cornellLocalParts(readFileSync(file, "utf8"))
          .filter((local) => !ALLOWED.test(local))
          .map((local) => `${path.relative(ROOT, file)}: ${local}@cornell.edu`),
      );
    expect(offenders).toEqual([]);
  });
});
