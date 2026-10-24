import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { HackathonTicker, type TickerEvent } from "./HackathonTicker";

/**
 * What a signed-out visitor sees at `/` (P1-24): "Find your Hackathon
 * Partner for", the next few hackathons finishing the sentence, and a way in.
 * The full board stays at `/?view=list`.
 */
export function Landing({ hackathons }: { hackathons: readonly TickerEvent[] }) {
  return (
    <section
      aria-labelledby="hero-heading"
      className="mx-auto flex w-full max-w-xl flex-col items-center gap-10 py-10 text-center sm:py-16"
    >
      <div className="flex w-full flex-col items-center gap-3.5">
        <h1
          id="hero-heading"
          className="flex flex-col items-center text-[clamp(2rem,10.2vw,3.25rem)] leading-[1.08] font-extrabold tracking-[-0.035em]"
        >
          {/* Always three centered lines; each line stays whole, scaled to fit narrow phones. */}
          <span className="whitespace-nowrap">Find your</span>{" "}
          <span className="whitespace-nowrap text-accent">Hackathon Partner</span>{" "}
          <span className="whitespace-nowrap">for</span>
        </h1>
        <HackathonTicker hackathons={hackathons} />
      </div>
      <Link
        href="/signup"
        className="inline-flex h-[58px] items-center justify-center gap-2 rounded-[14px] bg-accent px-10 text-[21px] font-bold text-accent-ink shadow-[0_8px_20px_rgba(79,70,229,0.28)] transition hover:opacity-90"
      >
        Match Now
        <ArrowRight aria-hidden="true" className="size-5" strokeWidth={2.25} />
      </Link>
    </section>
  );
}
