"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export type Offset = { x: number; y: number };
type Box = { left: number; top: number; right: number; bottom: number };

const ZERO: Offset = { x: 0, y: 0 };
const MARGIN = 8;
const KEY_STEP = 24;

/**
 * Keeps a panel moved by `offset` inside `bounds`. `panel` is where the panel is drawn now (it already
 * includes `current`), so its resting place is `panel - current`.
 */
export function clampOffset(offset: Offset, current: Offset, panel: Box, bounds: Box, margin = MARGIN): Offset {
  const rest = {
    left: panel.left - current.x,
    right: panel.right - current.x,
    top: panel.top - current.y,
    bottom: panel.bottom - current.y,
  };
  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));
  return {
    x: Math.round(clamp(offset.x, bounds.left + margin - rest.left, bounds.right - margin - rest.right)),
    y: Math.round(clamp(offset.y, bounds.top + margin - rest.top, bounds.bottom - margin - rest.bottom)),
  };
}

function readSaved(key: string): Offset {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? { x: v.x, y: v.y } : ZERO;
  } catch {
    return ZERO;
  }
}

function save(key: string, offset: Offset) {
  try {
    if (offset.x === 0 && offset.y === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(offset));
  } catch {
    // Storage blocked (private mode): the panel still moves, it just won't remember.
  }
}

/**
 * Drag a floating panel by a handle, inside its positioned parent. Arrow keys on the handle move it
 * too (Shift for bigger steps) and Home puts it back. The position is remembered in this browser.
 */
export function useDraggablePanel<T extends HTMLElement>(storageKey: string) {
  const [panel, setPanel] = useState<T | null>(null);
  const [offset, setOffset] = useState<Offset>(ZERO);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ pointerId: number; startX: number; startY: number; from: Offset; last: Offset } | null>(null);

  const fit = useCallback(
    (wanted: Offset, current: Offset): Offset => {
      const parent = panel?.offsetParent;
      if (!panel || !parent) return wanted;
      return clampOffset(wanted, current, panel.getBoundingClientRect(), parent.getBoundingClientRect());
    },
    [panel],
  );

  // The first size callback restores the saved spot (storage isn't readable during server render);
  // later ones keep the panel on screen when it or the window changes size (collapsing, rotating).
  useEffect(() => {
    const parent = panel?.offsetParent;
    if (!panel || !parent) return;
    let restored = false;
    const observer = new ResizeObserver(() => {
      if (!restored) {
        restored = true;
        const saved = readSaved(storageKey);
        setOffset((o) => fit(saved, o));
      } else {
        setOffset((o) => fit(o, o));
      }
    });
    observer.observe(panel);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [panel, fit, storageKey]);

  const handleProps = {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      // Only the primary button, and not when the press starts on a control inside the handle.
      if (e.button !== 0 || (e.target as HTMLElement).closest("button:not([data-drag-handle]), a, input, select")) {
        return;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, from: offset, last: offset };
      setDragging(true);
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const d = drag.current;
      if (!d || d.pointerId !== e.pointerId) return;
      d.last = fit({ x: d.from.x + e.clientX - d.startX, y: d.from.y + e.clientY - d.startY }, offset);
      setOffset(d.last);
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      const d = drag.current;
      if (!d || d.pointerId !== e.pointerId) return;
      drag.current = null;
      setDragging(false);
      save(storageKey, d.last);
    },
    onPointerCancel() {
      drag.current = null;
      setDragging(false);
    },
  };

  const onHandleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const step = e.shiftKey ? KEY_STEP * 4 : KEY_STEP;
    const moves: Record<string, Offset> = {
      ArrowLeft: { x: offset.x - step, y: offset.y },
      ArrowRight: { x: offset.x + step, y: offset.y },
      ArrowUp: { x: offset.x, y: offset.y - step },
      ArrowDown: { x: offset.x, y: offset.y + step },
      Home: ZERO,
    };
    const wanted = moves[e.key];
    if (!wanted) return;
    e.preventDefault();
    const next = fit(wanted, offset);
    setOffset(next);
    save(storageKey, next);
  };

  const reset = () => {
    setOffset(ZERO);
    save(storageKey, ZERO);
  };

  return { ref: setPanel, offset, dragging, handleProps, onHandleKeyDown, reset };
}
