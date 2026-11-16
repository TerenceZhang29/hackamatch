"use client";

import { useEffect, useRef } from "react";

const MARK = ["ring-2", "ring-amber-400"];

/**
 * Outlines the named fields of the surrounding form, as "Fill from event
 * site" does, until the admin edits each one: the values came from a
 * suggestion (docs/plans/event-discovery.md) and need checking.
 */
export function OutlineFields({ names }: { names: string[] }) {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = marker.current?.closest("form");
    if (!form) return;
    const cleanups: (() => void)[] = [];
    for (const name of names) {
      const field = form.elements.namedItem(name);
      if (!(field instanceof HTMLElement) || !("value" in field)) continue;
      field.classList.add(...MARK);
      const clear = () => field.classList.remove(...MARK);
      field.addEventListener("input", clear, { once: true });
      cleanups.push(() => {
        field.removeEventListener("input", clear);
        clear();
      });
    }
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [names]);
  return <span ref={marker} hidden />;
}
