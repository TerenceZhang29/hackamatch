import Link from "next/link";

/** Sign-in, onboarding and one-click pages: just the logo, nothing to wander off to. */
export default function FocusLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="mx-auto flex h-14 max-w-lg items-center px-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Hacka<span className="text-accent">Match</span>
        </Link>
      </header>
      {children}
    </>
  );
}
