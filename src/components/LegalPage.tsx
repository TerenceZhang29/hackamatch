import { ArrowLeft } from "lucide-react";
import Link from "next/link";

/** The contact address on the legal pages and in the App Store listing. */
export const CONTACT_EMAIL = "hello@hackamatch.com";

/** The frame of /terms and /privacy: a title, the date it took effect, and plain sections. */
export function LegalPage({
  title,
  effective,
  children,
}: {
  title: string;
  /** "November 11, 2026" */
  effective: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
      <Link href="/" aria-label="Home" className="-ml-2 self-start rounded-full p-2 text-muted">
        <ArrowLeft aria-hidden="true" className="size-5" />
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted">Effective {effective}</p>
      </header>
      {children}
      <p className="text-sm text-muted">
        Questions?{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
          {CONTACT_EMAIL}
        </a>
      </p>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  const id = title.toLowerCase().replaceAll(/[^a-z]+/g, "-");
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-2 text-[15px] leading-relaxed [&_a]:underline [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1 [&_ul]:pl-5"
    >
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}
