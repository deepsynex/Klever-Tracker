"use client";

import { useState, type HTMLAttributes, type PointerEvent, type ReactNode } from "react";
import { clampWindowRect, type WindowRect } from "@/lib/multi-tracking/core";
import { cn } from "@/lib/utils";

/** Smallest window, in pixels (converted to percent of the area while dragging). */
const MIN_W_PX = 260;
const MIN_H_PX = 190;

type Gesture = {
  kind: "move" | "resize";
  pointerId: number;
  x: number;
  y: number;
  from: WindowRect;
  areaW: number;
  areaH: number;
};

/**
 * A movable, resizable window inside the nearest `data-window-area` container (TouchTraks' Ext.Window). Drag the title bar
 * (`children` receives the props for it) to move, the corner handle to resize, double-click the
 * title bar to maximize. `rect` is in percent of the area, so windows keep their place when the
 * browser is resized; `onChange` fires once a gesture ends.
 */
export function FloatingWindow({
  rect,
  maximized,
  z,
  onChange,
  onFocus,
  onToggleMax,
  label,
  children,
}: {
  rect: WindowRect;
  maximized: boolean;
  z: number;
  onChange: (rect: WindowRect) => void;
  onFocus: () => void;
  onToggleMax: () => void;
  label: string;
  children: (titleBarProps: HTMLAttributes<HTMLElement>) => ReactNode;
}) {
  // While a gesture runs, the window follows the pointer locally; the parent hears the result once.
  const [live, setLive] = useState<WindowRect | null>(null);
  // Set at the start and end of a drag only (not per pointer move), so state is cheap here.
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const shown = maximized ? { x: 0, y: 0, w: 100, h: 100 } : (live ?? rect);

  const start = (kind: Gesture["kind"], e: PointerEvent<HTMLElement>) => {
    // The area is the nearest container marked data-window-area (no ref needed in these handlers).
    const box = e.currentTarget.closest("[data-window-area]")?.getBoundingClientRect();
    if (!box || e.button !== 0 || maximized) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setGesture({
      kind,
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      from: rect,
      areaW: box.width,
      areaH: box.height,
    });
    setLive(rect);
  };

  const move = (e: PointerEvent<HTMLElement>) => {
    const g = gesture;
    if (!g || g.pointerId !== e.pointerId) return;
    const dx = ((e.clientX - g.x) / g.areaW) * 100;
    const dy = ((e.clientY - g.y) / g.areaH) * 100;
    const minW = (MIN_W_PX / g.areaW) * 100;
    const minH = (MIN_H_PX / g.areaH) * 100;
    const next =
      g.kind === "move"
        ? { ...g.from, x: g.from.x + dx, y: g.from.y + dy }
        : // Resize from the bottom-right corner, never past the area's edge.
          { ...g.from, w: Math.min(g.from.w + dx, 100 - g.from.x), h: Math.min(g.from.h + dy, 100 - g.from.y) };
    setLive(clampWindowRect(next, minW, minH));
  };

  const end = (e: PointerEvent<HTMLElement>) => {
    const g = gesture;
    if (!g || g.pointerId !== e.pointerId) return;
    setGesture(null);
    if (live) onChange(live);
    setLive(null);
  };

  const titleBarProps: HTMLAttributes<HTMLElement> = {
    onPointerDown(e) {
      onFocus();
      // Buttons in the title bar (close) keep working; only the bar itself drags.
      if ((e.target as HTMLElement).closest("button, a, input, select")) return;
      start("move", e);
    },
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
    onDoubleClick(e) {
      if ((e.target as HTMLElement).closest("button, a, input, select")) return;
      onToggleMax();
    },
    className: cn("touch-none select-none", maximized ? "cursor-default" : "cursor-move"),
  };

  return (
    <div
      role="group"
      aria-label={label}
      onPointerDownCapture={onFocus}
      className={cn("absolute p-1.5", live && "will-change-[left,top,width,height]")}
      style={{ left: `${shown.x}%`, top: `${shown.y}%`, width: `${shown.w}%`, height: `${shown.h}%`, zIndex: z }}
    >
      <div className={cn("relative size-full", live && "pointer-events-auto [&_.gm-style]:pointer-events-none")}>
        {children(titleBarProps)}
        {!maximized ? (
          <span
            aria-hidden
            onPointerDown={(e) => {
              onFocus();
              start("resize", e);
            }}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            className="absolute bottom-0 right-0 z-10 size-5 cursor-nwse-resize touch-none rounded-br-xl"
            style={{
              background:
                "linear-gradient(135deg, transparent 50%, color-mix(in oklab, var(--fg) 35%, transparent) 50%)",
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
