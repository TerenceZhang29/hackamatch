import { Button } from "@/components/ui/Button";
import type { NycHackathon } from "@/lib/nyc-hackathons";
import { HackathonTicker } from "./HackathonTicker";

/**
 * What a signed-out visitor sees at `/`: the slogan, upcoming NYC
 * hackathons, and a way in. The full board stays at `/?view=list`.
 */
export function Landing({ hackathons }: { hackathons: readonly NycHackathon[] }) {
  return (
    <>
      <h1 className="max-w-2xl pt-8 text-4xl font-bold tracking-tight sm:text-5xl">
        Match for your next Hackathon here
      </h1>

      <HackathonTicker hackathons={hackathons} />

      <Button
        href={`/join?${new URLSearchParams({ next: "/onboarding", from: "hero" })}`}
        prefetch={false}
        size="lg"
        className="self-center"
      >
        Join with your Cornell email
      </Button>
    </>
  );
}
