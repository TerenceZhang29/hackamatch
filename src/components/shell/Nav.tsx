"use client";

import { CalendarDays, CircleUser, Compass, MessageCircle, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { href: string; label: string; icon: LucideIcon; match: (path: string) => boolean }[] =
  [
    { href: "/", label: "Discover", icon: Compass, match: (p) => p === "/" },
    {
      href: "/events",
      label: "Events",
      icon: CalendarDays,
      match: (p) => p.startsWith("/events") || p.startsWith("/e/"),
    },
    {
      href: "/matches",
      label: "Matches",
      icon: MessageCircle,
      match: (p) => p.startsWith("/matches"),
    },
    { href: "/me", label: "Me", icon: CircleUser, match: (p) => p.startsWith("/me") },
  ];

function Badge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      aria-hidden="true"
      className="absolute -top-1 -right-2 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 font-semibold text-accent-ink"
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

/** ", 2 waiting" after the Matches label, for screen readers (the badge is visual only). */
function Waiting({ count }: { count: number }) {
  return count ? <span className="sr-only">, {count} waiting</span> : null;
}

/** The members' four tabs: a bottom bar on phones, inline links in the top bar on wider screens. */
export function Tabs({ waiting, placement }: { waiting: number; placement: "top" | "bottom" }) {
  const path = usePathname();
  if (placement === "top") {
    return (
      <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const on = match(path);
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? "page" : undefined}
              className={`relative flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium ${
                on ? "bg-surface text-ink" : "text-muted hover:text-ink"
              }`}
            >
              <span className="relative">
                <Icon aria-hidden="true" className="size-4" />
                {label === "Matches" ? <Badge count={waiting} /> : null}
              </span>
              {label}
              {label === "Matches" ? <Waiting count={waiting} /> : null}
            </Link>
          );
        })}
      </nav>
    );
  }
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      <ul className="mx-auto flex max-w-md justify-around">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const on = match(path);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                className={`flex min-w-16 flex-col items-center gap-0.5 px-3 pt-2 pb-1.5 text-[11px] font-medium ${
                  on ? "text-accent" : "text-muted"
                }`}
              >
                <span className="relative">
                  <Icon aria-hidden="true" className="size-6" strokeWidth={on ? 2.4 : 1.8} />
                  {label === "Matches" ? <Badge count={waiting} /> : null}
                </span>
                {label}
                {label === "Matches" ? <Waiting count={waiting} /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
