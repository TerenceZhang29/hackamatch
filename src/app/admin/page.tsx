import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { adminCounts } from "@/server/admin";
import { AdminShell } from "./ui";

export default async function AdminHome() {
  await requireAdmin("/admin");
  const counts = await adminCounts();
  return (
    <AdminShell title="Admin">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-6">
        {(
          [
            ["Users", counts.users, "/admin/users"],
            ["Ideas", counts.ideas, "/admin/ideas"],
            ["Events", counts.events, "/admin/events"],
            ["Matches", counts.matches, "/admin/matches"],
            ["Teams", counts.teams, "/admin/matches"],
            ["Demo profiles", counts.demo, "/admin/users"],
          ] as const
        ).map(([label, value, href]) => (
          <div
            key={label}
            className="rounded border border-neutral-200 p-3 dark:border-neutral-800"
          >
            <dt className="text-sm text-neutral-500">
              <Link href={href} className="underline">
                {label}
              </Link>
            </dt>
            <dd className="text-2xl font-bold">{value}</dd>
          </div>
        ))}
      </dl>
    </AdminShell>
  );
}
