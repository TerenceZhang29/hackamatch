/**
 * Runs the weekly hackathon discovery job once, by hand
 * (docs/plans/event-discovery.md). Reads the sources for real (free); what
 * happens next depends on the environment in .env.local:
 *
 *   pnpm discover:events --dry   Reads the sources and lists what's new. No
 *                                model calls, nothing stored, no email.
 *   pnpm discover:events         Drafts each new one with LLM_PROVIDER (the
 *                                fake locally) and stores the suggestions.
 *                                No email: the script runs outside Next.js,
 *                                where emails can't be rendered; the route
 *                                (and its tests) send it.
 *
 * Refuses to run against anything but a local Supabase, so it can't write to
 * production. With LLM_PROVIDER=anthropic it makes paid model calls (up to 15,
 * a few cents): ask the owner first.
 */
import { getConfig } from "@/lib/config";
import { discoverEvents } from "@/server/event-discovery";

async function main() {
  const config = getConfig();
  const host = new URL(config.NEXT_PUBLIC_SUPABASE_URL).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Refusing to run against ${host}: local Supabase only`);
  }
  const dry = process.argv.includes("--dry");
  console.log(`Model: ${config.LLM_PROVIDER}${dry ? " (dry run: not used)" : ""}`);
  const result = await discoverEvents({ dry }, { notify: async () => 0 });
  for (const [source, r] of Object.entries(result.sources)) {
    console.log(`${source}: ${r.ok ? `${r.listed} listed` : `failed: ${r.error}`}`);
  }
  console.log(`\nNew (${result.fresh.length}):`);
  for (const item of result.fresh) {
    console.log(
      `  ${item.startDate}  ${item.name}  [${item.source}] ${item.venue ?? ""}  ${item.url}`,
    );
  }
  if (!dry) {
    console.log(
      `\nDrafted ${result.drafted} from their pages, stored ${result.stored} (no email from the script).`,
    );
    console.log(
      `Model calls: ${result.usage.calls} (${result.usage.inputTokens} in, ${result.usage.outputTokens} out tokens)`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
