"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const SIDE = 100; // px to the side for Pass / Interested
const UP = 80; // px up for the full profile
const TAP = 10; // px of movement still counted as a tap

/**
 * Swipe and keyboard gestures for the deck's top card (progressive
 * enhancement): right or → presses Interested, left or ← presses Pass, and
 * up, ↑ or a tap on the card opens the full profile. The buttons stay the real controls, so the
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
  const [leaving, setLeaving] = useState<"left" | "right" | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const press = (id: "deck-pass" | "deck-interested") => {
    setLeaving(id === "deck-pass" ? "left" : "right");
    // Let the card fly off, then submit the real form.
    window.setTimeout(() => document.getElementById(id)?.click(), 150);
  };

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
    if (d.x > SIDE) press("deck-interested");
    else if (d.x < -SIDE) press("deck-pass");
    else if (!expanded && d.y < -UP && Math.abs(d.x) < SIDE)
      router.push(moreHref, { scroll: false });
  }

  const x = leaving === "left" ? -600 : leaving === "right" ? 600 : (drag?.x ?? 0);
  const y = leaving ? 0 : Math.min(0, drag?.y ?? 0) / 3;
  const hint = drag
    ? drag.x > SIDE / 2
      ? "Interested"
      : drag.x < -SIDE / 2
        ? "Pass"
        : null
    : null;

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
        transform: `translate(${x}px, ${y}px) rotate(${x / 25}deg)`,
        transition: drag ? "none" : "transform 150ms ease-out",
        touchAction: expanded ? "pan-y" : "none",
      }}
      className={`relative select-none ${expanded ? "" : "cursor-pointer"}`}
    >
      {hint ? (
        <span
          aria-hidden="true"
          className={`absolute top-4 z-10 rounded-lg border-2 px-3 py-1 text-sm font-bold ${
            hint === "Interested"
              ? "right-4 border-green-600 text-green-700"
              : "left-4 border-neutral-500 text-neutral-600"
          }`}
        >
          {hint}
        </span>
      ) : null}
      {children}
    </div>
  );
}
