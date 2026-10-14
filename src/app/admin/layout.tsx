import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Admin · HackaMatch", robots: { index: false } };

/** Every /admin page is a 404 for anyone but an admin. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin("/admin");
  return children;
}
