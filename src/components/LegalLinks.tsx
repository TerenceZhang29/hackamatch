import Link from "next/link";

/** The terms and the privacy policy, as one quiet line at the foot of a page. */
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <p className={`text-center text-[13px] text-muted ${className}`}>
      <Link href="/terms" className="underline">
        Terms
      </Link>
      {" · "}
      <Link href="/privacy" className="underline">
        Privacy
      </Link>
    </p>
  );
}
