import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

// Placeholder until the onboarding flow lands in P1-06.
export default async function OnboardingPage() {
  const user = await requireUser("/onboarding");
  if (user.onboarded_at) redirect("/matches");

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Welcome to HackaMatch</h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        You&apos;re signed in as <span className="font-medium break-all">{user.cornell_email}</span>
        . Onboarding is coming soon.
      </p>
      <form action="/logout" method="post">
        <button type="submit" className="text-sm underline">
          Sign out
        </button>
      </form>
    </main>
  );
}
