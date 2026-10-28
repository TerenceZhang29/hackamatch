"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const UP = 80; // px up for the full profile
const TAP = 10; // px of movement still counted as a tap

/**
 * Gestures for the deck's top card (progressive enhancement): → presses
 * Interested, ← presses Pass, and a swipe up, ↑ or a tap on the card opens the
 * full profile. Swiping sideways does nothing (owner, 2026-10-27): Pass and
 * Interested are the buttons only. The buttons stay the real controls, so the
 * deck works the same without JavaScript.
 */
export function Swipe({
  children,
  moreHref,
  expanded,
}: {
  children: React.ReactNode;
  moreHref: string;
  expanded: boolean;
}) {
  const router = useRouter();
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const press = (id: "deck-pass" | "deck-interested") => document.getElementById(id)?.click();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (event.key === "ArrowRight") press("deck-interested");
      else if (event.key === "ArrowLeft") press("deck-pass");
      else if (event.key === "ArrowUp" && !expanded) router.push(moreHref, { scroll: false });
      else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function onPointerDown(event: React.PointerEvent) {
    // Links and buttons inside the card keep working as taps.
    if ((event.target as HTMLElement).closest("a, button")) return;
    start.current = { x: event.clientX, y: event.clientY };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: React.PointerEvent) {
    if (!start.current) return;
    setDrag({ x: event.clientX - start.current.x, y: event.clientY - start.current.y });
  }
  function onPointerUp() {
    if (!start.current) return;
    const d = drag ?? { x: 0, y: 0 };
    start.current = null;
    setDrag(null);
    // A tap (not a drag) on the collapsed card opens the full profile.
    if (Math.abs(d.x) < TAP && Math.abs(d.y) < TAP) {
      if (!expanded) router.push(moreHref, { scroll: false });
      return;
    }
    if (!expanded && d.y < -UP && Math.abs(d.y) > Math.abs(d.x))
      router.push(moreHref, { scroll: false });
  }

  // The card only follows the finger upwards.
  const y = Math.min(0, drag?.y ?? 0) / 3;

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        start.current = null;
        setDrag(null);
      }}
      // A collapsed card owns its gestures; an expanded one still scrolls up and down.
      style={{
        transform: `translateY(${y}px)`,
        transition: drag ? "none" : "transform 150ms ease-out",
        touchAction: expanded ? "pan-y" : "none",
      }}
      className={`relative select-none ${expanded ? "" : "cursor-pointer"}`}
    >
      {children}
    </div>
  );
}
