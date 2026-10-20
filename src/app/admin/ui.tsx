import Link from "next/link";

/** Small shared pieces for the admin pages: plain, functional, no styling beyond defaults. */

export const table = "w-full border-collapse text-left text-sm";
export const th = "border-b border-neutral-200 px-2 py-2 font-medium dark:border-neutral-800";
export const td = "border-b border-neutral-100 px-2 py-2 align-top dark:border-neutral-900";
export const input =
  "rounded border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700";
export const button = "rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700";

export function AdminShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <nav className="flex flex-wrap gap-4 text-sm">
        <Link href="/admin" className="font-bold">
          Admin
        </Link>
        <Link href="/admin/users" className="underline">
          Users
        </Link>
        <Link href="/admin/ideas" className="underline">
          Ideas
        </Link>
        <Link href="/admin/events" className="underline">
          Events
        </Link>
        <Link href="/admin/matches" className="underline">
          Matches
        </Link>
        <Link href="/admin/pilot" className="underline">
          Pilot access
        </Link>
        <Link href="/" className="ml-auto underline">
          Back to the app
        </Link>
      </nav>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {children}
    </main>
  );
}

export function Notice({ params }: { params: Record<string, string | string[] | undefined> }) {
  const error = typeof params.error === "string" ? params.error : null;
  const ok =
    typeof params.saved === "string"
      ? `Saved (${params.saved})`
      : params.created
        ? "Match created; both people were emailed."
        : null;
  if (!error && !ok) return null;
  return (
    <p
      role={error ? "alert" : "status"}
      className={`rounded px-3 py-2 text-sm ${error ? "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200" : "bg-neutral-100 dark:bg-neutral-900"}`}
    >
      {error ?? ok}
    </p>
  );
}

export function shortDate(value: string | null): string {
  return value ? value.slice(0, 10) : "–";
}

/** A table that can scroll sideways on small screens, reachable by keyboard. */
export function ScrollTable({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto">
      {children}
    </div>
  );
}
