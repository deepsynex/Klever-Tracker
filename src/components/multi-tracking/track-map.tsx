"use client";

import { AdvancedMarker, Map, useMap } from "@vis.gl/react-google-maps";
import { useEffect, useRef, useState } from "react";
import { DUBAI_CENTER } from "@/lib/heatmap/client";
import { headingOf, type LiveStatus, type Track } from "@/lib/multi-tracking/core";

export const STATUS_COLOR: Record<LiveStatus, string> = {
  moving: "var(--status-moving)",
  idle: "var(--status-idle)",
  stopped: "var(--status-stopped)",
  offline: "var(--status-offline)",
};

export type MapEntry = { id: string; label: string; color: string; track: Track };

type Props = {
  mode: "tile" | "single";
  entries: MapEntry[];
  version: number;
  /** Tile: pan to each new fix while true. */
  follow?: boolean;
  /** The user dragged the map (tile: Follow turns off). */
  onUserMove?: () => void;
  /** Single map: fits every vehicle when this changes. */
  fitKey?: number;
  dark: boolean;
};

const FOLLOW_ZOOM = 15;

/**
 * A Google map for Multi Tracking. Created once per tile (never re-created on re-render);
 * one polyline and one marker per vehicle, both updated in place (plan §8.5).
 */
export function TrackMap({ mode, entries, version, follow = true, onUserMove, fitKey = 0, dark }: Props) {
  return (
    <Map
      className="size-full"
      mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID"}
      colorScheme={dark ? "DARK" : "LIGHT"}
      defaultCenter={DUBAI_CENTER}
      defaultZoom={mode === "tile" ? FOLLOW_ZOOM : 11}
      gestureHandling="greedy"
      disableDefaultUI
      zoomControl={mode === "single"}
      // Tiles get Google's own Map/Satellite switch and fullscreen, like the TouchTraks windows.
      mapTypeControl={mode === "tile"}
      fullscreenControl={mode === "tile"}
      clickableIcons={false}
      keyboardShortcuts={false}
    >
      <Trails entries={entries} version={version} />
      {mode === "tile" ? (
        <TileCamera entry={entries[0]} version={version} follow={follow} onUserMove={onUserMove} />
      ) : (
        <FitCamera entries={entries} version={version} fitKey={fitKey} />
      )}
      {entries.map((e) =>
        e.track.latest ? <VehicleMarker key={e.id} entry={e} version={version} labelled={mode === "single"} /> : null,
      )}
    </Map>
  );
}

type Line = { poly: google.maps.Polyline; first: number; count: number };

function Trails({ entries, version }: { entries: MapEntry[]; version: number }) {
  const map = useMap();
  const lines = useRef(new globalThis.Map<string, Line>());

  useEffect(() => {
    const current = lines.current;
    return () => {
      current.forEach((l) => l.poly.setMap(null));
      current.clear();
    };
  }, [map]);

  useEffect(() => {
    if (!map) return;
    const live = new Set(entries.map((e) => e.id));
    for (const [id, l] of lines.current) {
      if (!live.has(id)) {
        l.poly.setMap(null);
        lines.current.delete(id);
      }
    }
    for (const e of entries) {
      const trail = e.track.trail;
      let l = lines.current.get(e.id);
      if (!l) {
        l = {
          poly: new google.maps.Polyline({
            map,
            strokeColor: e.color,
            strokeOpacity: 0.9,
            strokeWeight: 4,
            clickable: false,
          }),
          first: -1,
          count: 0,
        };
        lines.current.set(e.id, l);
      }
      l.poly.setOptions({ strokeColor: e.color });
      const first = trail[0]?.time ?? -1;
      if (first !== l.first || trail.length < l.count) {
        // Trail rebuilt (preload merged) or trimmed by the cap: redraw once.
        l.poly.setPath(trail.map((p) => ({ lat: p.lat, lng: p.lng })));
      } else {
        const path = l.poly.getPath();
        for (let i = l.count; i < trail.length; i++) path.push(new google.maps.LatLng(trail[i].lat, trail[i].lng));
      }
      l.first = first;
      l.count = trail.length;
    }
  }, [map, entries, version]);

  return null;
}

function TileCamera({
  entry,
  version,
  follow,
  onUserMove,
}: {
  entry: MapEntry | undefined;
  version: number;
  follow: boolean;
  onUserMove?: () => void;
}) {
  const map = useMap();
  const placed = useRef(false);
  const lastTime = useRef(0);
  const latest = entry?.track.latest ?? null;

  useEffect(() => {
    if (!map || !onUserMove) return;
    const l = map.addListener("dragstart", onUserMove);
    return () => l.remove();
  }, [map, onUserMove]);

  useEffect(() => {
    if (!map || !latest) return;
    if (!placed.current) {
      placed.current = true;
      lastTime.current = latest.time;
      map.setCenter(latest);
      map.setZoom(FOLLOW_ZOOM);
      return;
    }
    if (follow && latest.time !== lastTime.current) map.panTo(latest);
    lastTime.current = latest.time;
  }, [map, latest, version, follow]);

  // Turning Follow back on re-centres straight away (acceptance test #11).
  const wasFollowing = useRef(follow);
  useEffect(() => {
    if (map && follow && !wasFollowing.current && latest) map.panTo(latest);
    wasFollowing.current = follow;
  }, [map, follow, latest]);

  return null;
}

function FitCamera({ entries, version, fitKey }: { entries: MapEntry[]; version: number; fitKey: number }) {
  const map = useMap();
  const fitted = useRef<string>("");

  useEffect(() => {
    if (!map) return;
    const points = entries.flatMap((e) => (e.track.latest ? [e.track.latest] : []));
    if (points.length === 0) return;
    // Fit once per (fit request, set of vehicles with a position): new vehicles re-fit, live moves don't.
    const key = `${fitKey}|${entries
      .filter((e) => e.track.latest)
      .map((e) => e.id)
      .join(",")}`;
    if (fitted.current === key) return;
    fitted.current = key;
    if (points.length === 1) {
      map.panTo(points[0]);
      map.setZoom(FOLLOW_ZOOM - 1);
      return;
    }
    const b = new google.maps.LatLngBounds();
    points.forEach((p) => b.extend(p));
    map.fitBounds(b, 72);
  }, [map, entries, version, fitKey]);

  return null;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Glides the marker to each new fix over ~1 s (skipped for reduced motion). */
function useGlide(target: { lat: number; lng: number }) {
  const [pos, setPos] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    if (prefersReducedMotion() || (start.lat === target.lat && start.lng === target.lng)) {
      from.current = target;
      setPos(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 1000);
      const e = 1 - Math.pow(1 - k, 3);
      const p = { lat: start.lat + (target.lat - start.lat) * e, lng: start.lng + (target.lng - start.lng) * e };
      from.current = p;
      setPos(p);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target.lat, target.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return pos;
}

function VehicleMarker({ entry, version, labelled }: { entry: MapEntry; version: number; labelled: boolean }) {
  const latest = entry.track.latest!;
  const status = latest.status ?? "offline";
  const color = STATUS_COLOR[status];
  const heading = useStableHeading(entry.track, version);
  const pos = useGlide(latest);

  return (
    <AdvancedMarker
      position={pos}
      zIndex={status === "moving" ? 20 : 10}
      title={entry.label}
      anchorLeft="-50%"
      anchorTop="-50%"
    >
      <span className="relative grid size-11 place-items-center" aria-hidden>
        {status === "moving" ? (
          <span className="absolute size-6 rounded-full animate-ping-soft" style={{ background: color }} />
        ) : null}
        <span
          className="relative grid size-8 place-items-center rounded-full border-2 shadow-[0_8px_20px_-6px_rgb(0_0_0/0.55)] transition-transform duration-700 ease-out"
          style={{
            background: color,
            borderColor: labelled ? entry.color : "white",
            transform: `rotate(${heading}deg)`,
          }}
        >
          <svg viewBox="0 0 24 24" className="size-4 text-white" fill="currentColor">
            {status === "moving" || status === "idle" ? (
              <path d="M12 2.5 19.5 20 12 16.2 4.5 20Z" />
            ) : (
              <circle cx="12" cy="12" r="5" />
            )}
          </svg>
        </span>
        {labelled ? (
          <span
            className="glass-panel absolute top-full mt-0.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-bold text-foreground"
            style={{ boxShadow: `inset 3px 0 0 ${entry.color}` }}
            dir="ltr"
          >
            {entry.label}
          </span>
        ) : null}
      </span>
    </AdvancedMarker>
  );
}

function useStableHeading(track: Track, version: number) {
  void version; // the track is mutated in place
  return headingOf(track);
}
