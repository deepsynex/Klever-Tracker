"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { glidePosition, startGlide, type Glide } from "@/lib/live/glide";
import { glideDurationMs } from "@/lib/vehicle-management/helpers";

type Movable = {
  id: string;
  lat: number | null;
  lng: number | null;
  heading: number | null;
  recordedAt: string | null;
};
type Drawn = { lat: number; lng: number; heading: number | null };

/** Redraws at most this often while something glides (smooth enough, and light on the map). */
const FRAME_MS = 33;

/**
 * The vehicles as they should be drawn now: each new fix glides from where the marker was to the
 * new position over about the real time between fixes (capped by `refreshMs`), pointing the way
 * it moves. Vehicles that didn't move are returned as they are.
 */
export function useGlidingVehicles<V extends Movable>(vehicles: V[], refreshMs: number): V[] {
  const glides = useRef(new Map<string, Glide>());
  const lastFix = useRef(new Map<string, string | null>());
  const [drawn, setDrawn] = useState<Map<string, Drawn>>(() => new Map());

  useEffect(() => {
    const now = performance.now();
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const seen = new Set<string>();
    for (const v of vehicles) {
      if (v.lat === null || v.lng === null) continue;
      seen.add(v.id);
      const current = glides.current.get(v.id);
      if (current && current.to.lat === v.lat && current.to.lng === v.lng) continue;
      const shown = current ? glidePosition(current, now) : null;
      const duration = glideDurationMs(lastFix.current.get(v.id), v.recordedAt, refreshMs);
      glides.current.set(
        v.id,
        startGlide(
          shown,
          { lat: v.lat, lng: v.lng },
          v.heading,
          current?.heading ?? null,
          duration,
          now,
          reducedMotion,
        ),
      );
      lastFix.current.set(v.id, v.recordedAt);
    }
    for (const id of [...glides.current.keys()]) if (!seen.has(id)) glides.current.delete(id);

    const snapshot = (t: number) => {
      let moving = false;
      const next = new Map<string, Drawn>();
      for (const [id, g] of glides.current) {
        const p = glidePosition(g, t);
        if (!p.done) moving = true;
        next.set(id, { lat: p.lat, lng: p.lng, heading: g.heading });
      }
      return { next, moving };
    };

    // Redraw every FRAME_MS until every glide has arrived.
    let frame: number | null = null;
    let last = -Infinity;
    const loop = (t: number) => {
      const { next, moving } = snapshot(t);
      if (!moving || t - last >= FRAME_MS) {
        last = t;
        setDrawn(next);
      }
      frame = moving ? requestAnimationFrame(loop) : null;
    };
    frame = requestAnimationFrame(loop);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [vehicles, refreshMs]);

  return useMemo(
    () =>
      vehicles.map((v) => {
        const p = drawn.get(v.id);
        return p ? { ...v, lat: p.lat, lng: p.lng, heading: p.heading ?? v.heading } : v;
      }),
    [vehicles, drawn],
  );
}
