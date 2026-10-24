import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Tabs } from "./Nav";

export type ShellViewer = "anon" | "not-onboarded" | "onboarded";

/**
 * The app shell (docs/design.md): a slim top bar on every page, and for
 * members the four tabs (bottom bar on phones, top bar on wider screens).
 */
export function Shell({
  viewer,
  waiting,
  children,
}: {
  viewer: ShellViewer;
  waiting: number;
  children: React.ReactNode;
}) {
  const member = viewer === "onboarded";
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <Link href="/" className="text-lg font-bold tracking-tight">
            Hacka<span className="text-accent">Match</span>
          </Link>
          {member ? <Tabs waiting={waiting} placement="top" /> : null}
          {member ? null : viewer === "not-onboarded" ? (
            <Button href="/onboarding" size="sm">
              Finish joining
            </Button>
          ) : (
            <div className="flex items-center gap-1">
              <Button href="/events" size="sm" variant="ghost">
                Events
              </Button>
              <Button href="/login" size="sm" variant="secondary">
                Sign in
              </Button>
            </div>
          )}
        </div>
      </header>
      <div className={member ? "pb-20 sm:pb-0" : ""}>{children}</div>
      {member ? <Tabs waiting={waiting} placement="bottom" /> : null}
    </>
  );
}
