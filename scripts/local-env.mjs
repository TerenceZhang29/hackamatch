// Writes .env.local from .env.example, filling in the URL and keys of the
// running local Supabase stack. Usage: `pnpm db:start && pnpm db:env`.
// Existing .env.local values other than the Supabase ones are kept.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const status = JSON.parse(
  execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);

const supabaseValues = {
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
};
for (const [key, value] of Object.entries(supabaseValues)) {
  if (!value) throw new Error(`supabase status did not report ${key}; is the stack running?`);
}

const parse = (text) =>
  Object.fromEntries(
    text
      .split("\n")
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );

const existing = existsSync(".env.local") ? parse(readFileSync(".env.local", "utf8")) : {};
const output = readFileSync(".env.example", "utf8")
  .split("\n")
  .map((line) => {
    const match = /^([A-Z0-9_]+)=/.exec(line);
    if (!match) return line;
    const key = match[1];
    const value = supabaseValues[key] ?? existing[key];
    return value === undefined ? line : `${key}=${value}`;
  })
  .join("\n");

writeFileSync(".env.local", output);
console.log("Wrote .env.local with local Supabase URL and keys.");
