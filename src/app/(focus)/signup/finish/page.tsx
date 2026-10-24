import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buttonClass } from "@/components/ui/Button";
import { requireUser } from "@/lib/auth";
import { displayLabel } from "@/lib/taxonomy/labels";
import { joinName } from "@/lib/display-name";
import { listUpcomingEvents } from "@/server/events";
import { getPendingSignup } from "@/server/signup";
import { finishSignup } from "../actions";

export const metadata: Metadata = { title: "Finish joining · HackaMatch" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-line py-3 last:border-0">
      <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

/**
 * After the sign-in link (P1-24): the answers given before the email, shown
 * back with Join. Never applied silently, since anyone can type someone
 * else's email. Without waiting answers, the steps start again.
 */
export default async function FinishSignupPage() {
  const user = await requireUser("/signup/finish");
  if (user.onboarded_at) redirect("/");
  const answers = await getPendingSignup(user.cornell_email);
  if (!answers) redirect("/onboarding");
  const events = (await listUpcomingEvents()).filter((event) =>
    answers.eventIds.includes(event.id),
  );

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 pt-6 pb-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Here&apos;s what you told us</h1>
        <p className="text-muted">Join to start matching. You can change any of this later.</p>
      </div>
      <dl className="rounded-2xl bg-surface px-4">
        <Row label="Name">{joinName(answers.firstName, answers.lastName)}</Row>
        <Row label="Hackathons">
          {events.length ? events.map((event) => event.name).join(", ") : "Undecided yet"}
        </Row>
        <Row label="Areas">
          {answers.domains.length ? answers.domains.map(displayLabel).join(", ") : "None yet"}
        </Row>
        <Row label="Top skills">{answers.skills.map(displayLabel).join(", ")}</Row>
      </dl>
      <form action={finishSignup}>
        <button type="submit" className={buttonClass("primary", "lg", "w-full")}>
          Join
        </button>
      </form>
      <form action="/logout" method="post" className="text-center text-sm text-muted">
        Not you? Signed in as <span className="break-all">{user.cornell_email}</span> ·{" "}
        <button type="submit" className="underline">
          Sign out
        </button>
      </form>
    </main>
  );
}
