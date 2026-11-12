"use client";

import { X } from "lucide-react";
import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { isSwipeAway } from "@/lib/notifications/dismissed";
import { cn } from "@/lib/utils";

/** Pixels a pointer must move before the gesture counts as a swipe rather than a click. */
const DRAG_START_PX = 6;

/**
 * A list item that can be swiped left or right to remove it, like a phone notification, with
 * touch or a mouse drag. A short drag springs back; a far or fast one slides it out and calls
 * `onDismiss`. A drag never triggers `onOpen`. The × button does the same for keyboard and
 * screen-reader users. With reduced motion, items leave without sliding.
 */
export function SwipeToDismiss({
  onOpen,
  onDismiss,
  dismissLabel,
  className,
  children,
}: {
  onOpen: () => void;
  onDismiss: () => void;
  dismissLabel: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  const dragging = useRef(false);
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<0 | 1 | -1>(0);
  const [animate, setAnimate] = useState(false);

  const reducedMotion = () =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const leave = (direction: 1 | -1) => {
    if (reducedMotion()) {
      onDismiss();
      return;
    }
    setAnimate(true);
    setLeaving(direction);
    window.setTimeout(onDismiss, 200);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("[data-dismiss]")) return;
    start.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId };
    dragging.current = false;
    setAnimate(false);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const moveX = e.clientX - s.x;
    const moveY = e.clientY - s.y;
    if (!dragging.current) {
      // Vertical moves scroll the list; only a mostly-horizontal move starts a swipe.
      if (Math.abs(moveX) < DRAG_START_PX || Math.abs(moveX) < Math.abs(moveY)) return;
      dragging.current = true;
      ref.current?.setPointerCapture(e.pointerId);
    }
    setDx(moveX);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    start.current = null;
    if (!s || s.id !== e.pointerId || !dragging.current) return; // a plain click: handled by onClick
    const width = ref.current?.offsetWidth ?? 0;
    const moved = e.clientX - s.x;
    if (isSwipeAway(moved, width, e.timeStamp - s.t)) {
      leave(moved > 0 ? 1 : -1);
    } else {
      setAnimate(true);
      setDx(0);
    }
  };

  const onPointerCancel = () => {
    start.current = null;
    dragging.current = false;
    setAnimate(true);
    setDx(0);
  };

  const offset = leaving ? `${leaving * 110}%` : `${dx}px`;
  const fade = leaving ? 0 : Math.max(0.35, 1 - Math.abs(dx) / 320);

  return (
    <div className="group relative overflow-hidden">
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={(e) => {
          // The click that ends a swipe isn't a tap.
          if (dragging.current) {
            dragging.current = false;
            e.preventDefault();
            return;
          }
          onOpen();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          } else if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            leave(1);
          }
        }}
        className={cn(
          "relative cursor-pointer touch-pan-y select-none",
          animate && "transition-[transform,opacity] duration-200 ease-out",
          className,
        )}
        style={{ transform: `translateX(${offset})`, opacity: fade }}
      >
        {children}
      </div>
      <button
        type="button"
        data-dismiss
        onClick={() => leave(1)}
        aria-label={dismissLabel}
        title={dismissLabel}
        className="absolute end-2 top-2 grid size-6 place-items-center rounded-full bg-surface text-muted-foreground opacity-0 shadow-sm ring-1 ring-border/70 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
