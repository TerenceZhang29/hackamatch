import { Handshake } from "lucide-react";
import { Button } from "@/components/ui/Button";

export type Viewer = "anon" | "not-onboarded" | "onboarded";

/**
 * What a card offers each kind of viewer. Logged-out visitors go through
 * /join (which records the click) to sign in and come back to this card.
 */
export function CardActions({
  viewer,
  cardPath,
  onboarded,
}: {
  viewer: Viewer;
  cardPath: string;
  /** Rendered for onboarded viewers (Interested / Pass). */
  onboarded?: React.ReactNode;
}) {
  if (viewer === "onboarded") return <>{onboarded}</>;
  const href =
    viewer === "anon"
      ? `/join?${new URLSearchParams({ next: cardPath, from: "card" })}`
      : "/onboarding";
  return (
    <div className="mt-auto flex gap-2">
      <Button href={href} prefetch={false} size="sm">
        {viewer === "anon" ? <Handshake aria-hidden="true" className="size-4" /> : null}
        {viewer === "anon" ? "Interested" : "Finish joining to connect"}
      </Button>
    </div>
  );
}
