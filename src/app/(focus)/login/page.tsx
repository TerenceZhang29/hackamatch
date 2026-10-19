import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { sanitizeNext } from "@/lib/auth-helpers";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in · HackaMatch" };

const NOTICES: Record<string, string> = {
  link: "That sign-in link has expired or was already used. Request a new one.",
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  const next = sanitizeNext(first(params.next));

  const user = await getUser();
  if (user) redirect(user.onboarded_at ? (next ?? "/matches") : "/onboarding");

  const notice = NOTICES[first(params.error) ?? ""] ?? null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-16">
      <LoginForm next={next} notice={notice} />
    </main>
  );
}
