import type { Metadata } from "next";
import Link from "next/link";
import { getConfig } from "@/lib/config";
import { displayName } from "@/lib/display-name";
import { tokenSecret } from "@/server/notify";
import { verifyToken, type TokenPayload } from "@/lib/notify/tokens";
import { describePause, isPaused } from "@/lib/pause";
import { createServiceClient } from "@/lib/supabase/service";
import { getMatch, otherUserId, sideOf } from "@/server/matches";
import { pauseFromToken, respondFromToken } from "./actions";

export const metadata: Metadata = { title: "HackaMatch", robots: { index: false } };

const primaryButton =
  "rounded-lg bg-neutral-900 px-4 py-3 text-base font-medium text-white dark:bg-neutral-100 dark:text-neutral-900";
const secondaryButton =
  "rounded-lg border border-neutral-300 px-4 py-3 text-base dark:border-neutral-700";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-4 py-12">
      <p className="text-sm font-bold">HackaMatch</p>
      {children}
    </main>
  );
}

function LinkProblem({ expired }: { expired: boolean }) {
  return (
    <Shell>
      <h1 className="text-2xl font-bold tracking-tight">
        {expired ? "This link has expired" : "This link isn't valid"}
      </h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        Sign in to see and answer your matches.
      </p>
      <Link href="/login?next=%2Fmatches" className={`self-start ${primaryButton}`}>
        Sign in
      </Link>
    </Shell>
  );
}

/**
 * Landing page for one-click email links. Loading it changes nothing (mail
 * scanners fetch links); the buttons post to server actions.
 */
export default async function TokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const token = decodeURIComponent((await params).token);
  const done = (await searchParams).done !== undefined;
  const verified = verifyToken(token, tokenSecret());
  if (!verified.ok) return <LinkProblem expired={verified.reason === "expired"} />;

  return verified.payload.action === "pause" ? (
    <PausePage token={token} payload={verified.payload} done={done} />
  ) : (
    <ResponsePage token={token} payload={verified.payload} done={done} />
  );
}

async function ResponsePage({
  token,
  payload,
  done,
}: {
  token: string;
  payload: TokenPayload;
  done: boolean;
}) {
  const match = payload.matchId ? await getMatch(payload.matchId) : null;
  const side = match ? sideOf(match, payload.userId) : null;
  if (!match || !side) return <LinkProblem expired={false} />;

  const otherId = otherUserId(match, payload.userId);
  const supabase = createServiceClient();
  const [{ data: other }, { data: profile }, { data: idea }] = await Promise.all([
    supabase.from("users").select("name").eq("id", otherId).maybeSingle(),
    supabase.from("profiles").select("summary").eq("user_id", otherId).maybeSingle(),
    match.idea_id
      ? supabase.from("ideas").select("pitch").eq("id", match.idea_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const name = displayName(other?.name);
  const current = side === "a" ? match.a_response : match.b_response;
  const preferred = payload.action as "interested" | "pass";
  const alternative = preferred === "interested" ? "pass" : "interested";
  const label = { interested: "Yes, I'm interested", pass: "Pass" } as const;

  return (
    <Shell>
      {done && match.revealed_at ? (
        <>
          <h1 className="text-2xl font-bold tracking-tight">It&apos;s a match!</h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            You and {name} are both interested. We&apos;ve emailed you each other&apos;s contact
            details.
          </p>
          <Link href={`/matches/${match.id}`} className={`self-start ${primaryButton}`}>
            Open your match
          </Link>
        </>
      ) : done ? (
        <>
          <h1 className="text-2xl font-bold tracking-tight">
            {current === "interested" ? "Thanks, you're interested" : "Got it, you passed"}
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            {current === "interested"
              ? `If ${name} is interested too, we'll email you both.`
              : "We won't show you this match again. You stay in the pool."}
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold tracking-tight">Build with {name}?</h1>
          {idea?.pitch ? (
            <p className="text-neutral-600 dark:text-neutral-400">{idea.pitch}</p>
          ) : null}
          {profile?.summary ? (
            <p className="text-neutral-600 dark:text-neutral-400">{profile.summary}</p>
          ) : null}
        </>
      )}

      {!match.revealed_at ? (
        <form action={respondFromToken} className="flex flex-col gap-3">
          <input type="hidden" name="token" value={token} />
          {done ? (
            <button
              type="submit"
              name="response"
              value={current === "interested" ? "pass" : "interested"}
              className={`self-start ${secondaryButton}`}
            >
              Change my answer: {current === "interested" ? "pass" : "I'm interested"}
            </button>
          ) : (
            <>
              <button type="submit" name="response" value={preferred} className={primaryButton}>
                {label[preferred]}
              </button>
              <button type="submit" name="response" value={alternative} className={secondaryButton}>
                {label[alternative]}
              </button>
            </>
          )}
        </form>
      ) : null}
    </Shell>
  );
}

async function PausePage({
  token,
  payload,
  done,
}: {
  token: string;
  payload: TokenPayload;
  done: boolean;
}) {
  const { data: user } = await createServiceClient()
    .from("users")
    .select("paused_until")
    .eq("id", payload.userId)
    .maybeSingle();
  if (!user) return <LinkProblem expired={false} />;
  const paused = isPaused(user.paused_until);

  return (
    <Shell>
      <h1 className="text-2xl font-bold tracking-tight">
        {paused ? describePause(user.paused_until!, getConfig().APP_TIMEZONE) : "Pause matches?"}
      </h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        {paused
          ? "You're off the board and won't get new matches. Your existing matches stay."
          : done
            ? "Matches are back on."
            : "You'll leave the board and stop getting new matches. Your existing matches stay."}
      </p>
      <form action={pauseFromToken} className="flex flex-col gap-3">
        <input type="hidden" name="token" value={token} />
        {paused ? (
          <button type="submit" name="choice" value="resume" className={primaryButton}>
            Turn matches back on
          </button>
        ) : (
          <>
            <button type="submit" name="choice" value="week" className={secondaryButton}>
              Pause for a week
            </button>
            <button type="submit" name="choice" value="month" className={secondaryButton}>
              Pause for a month
            </button>
            <button type="submit" name="choice" value="indefinite" className={secondaryButton}>
              Pause until I turn it back on
            </button>
          </>
        )}
      </form>
      <Link href="/me" className="text-sm underline">
        Manage everything on your profile
      </Link>
    </Shell>
  );
}
