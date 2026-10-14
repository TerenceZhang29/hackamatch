import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-2xl font-bold tracking-tight">Not found</h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        This page doesn&apos;t exist, or it isn&apos;t shared with you.
      </p>
      <Link href="/" className="self-start underline">
        Back to the board
      </Link>
    </main>
  );
}
