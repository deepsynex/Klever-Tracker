"use client";

import { useEffect, useRef, useState } from "react";
import Map, { FullscreenControl, Marker, NavigationControl, useMap } from "react-map-gl/maplibre";
import { bearing, metres, type LatLng } from "@/lib/history/road-path";
import { maptilerStyleUrl } from "@/lib/maplibre";
import { glideDurationMs, MAX_GLIDE_METRES } from "@/lib/vehicle-management/helpers";

/** Same arrow colour as the Google version and the Live screen. */
const ARROW_FILL = "#0B6E69";

/**
 * The public /track map on OpenStreetMap (MapTiler tiles, MapLibre). Like the Google version in
 * public-track-view.tsx: an arrow that glides to each new fix along its direction of travel, with
 * the map following it.
 */
export function TrackOsmMap({
  maptilerKey,
  latitude,
  longitude,
  heading,
  recordedAt,
  label,
  refreshMs,
  ariaLabel,
}: {
  maptilerKey: string;
  latitude: number;
  longitude: number;
  heading: number | null;
  recordedAt: string | null;
  label: string | null;
  refreshMs: number;
  ariaLabel: string;
}) {
  return (
    <div className="h-[60dvh] min-h-80 w-full bg-surface-2" role="region" aria-label={ariaLabel}>
      <Map
        initialViewState={{ latitude, longitude, zoom: 15 }}
        mapStyle={maptilerStyleUrl(maptilerKey)}
        style={{ width: "100%", height: "100%" }}
        attributionControl={{ compact: true }}
      >
        <NavigationControl position="bottom-right" showCompass={false} />
        <FullscreenControl position="top-right" />
        <GlidingArrow
          latitude={latitude}
          longitude={longitude}
          heading={heading}
          recordedAt={recordedAt}
          label={label}
          refreshMs={refreshMs}
        />
      </Map>
    </div>
  );
}

function GlidingArrow({
  latitude,
  longitude,
  heading,
  recordedAt,
  label,
  refreshMs,
}: {
  latitude: number;
  longitude: number;
  heading: number | null;
  recordedAt: string | null;
  label: string | null;
  refreshMs: number;
}) {
  const { current: map } = useMap();
  const [shown, setShown] = useState<{ position: LatLng; rotation: number }>(() => ({
    position: { lat: latitude, lng: longitude },
    rotation: heading ?? 0,
  }));
  // The arrow's drawn position (mid-glide too) and direction, read when the next fix arrives.
  const shownRef = useRef(shown);
  const lastFixTimeRef = useRef<string | null>(recordedAt);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!map) return;
    const to = { lat: latitude, lng: longitude };
    const from = shownRef.current.position;
    const distance = metres(from, to);
    // Point along the movement; when (nearly) still, keep the device's own heading.
    const rotation = distance > 3 ? bearing(from, to) : (heading ?? shownRef.current.rotation);
    const draw = (p: LatLng, follow: "pan" | "center") => {
      shownRef.current = { position: p, rotation };
      setShown(shownRef.current);
      if (follow === "pan") map.panTo([p.lng, p.lat]);
      else map.setCenter([p.lng, p.lat]);
    };

    const duration = glideDurationMs(lastFixTimeRef.current, recordedAt, refreshMs);
    lastFixTimeRef.current = recordedAt;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (distance < 0.5 || distance > MAX_GLIDE_METRES || reducedMotion) {
      // The first fix lands here too (distance 0): nothing to animate.
      if (distance >= 0.5) draw(to, "pan");
      return;
    }

    const start = performance.now();
    const frame = (now: number) => {
      const k = Math.min(1, (now - start) / duration);
      draw({ lat: from.lat + (to.lat - from.lat) * k, lng: from.lng + (to.lng - from.lng) * k }, "center");
      frameRef.current = k < 1 ? requestAnimationFrame(frame) : null;
    };
    frameRef.current = requestAnimationFrame(frame);
    return () => {
      // A newer fix arrived mid-glide: the next glide starts from where the arrow is now.
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [map, latitude, longitude, heading, recordedAt, refreshMs]);

  return (
    <Marker latitude={shown.position.lat} longitude={shown.position.lng} anchor="center">
      <svg
        viewBox="0 0 24 24"
        className="size-8 drop-shadow-md"
        style={{ transform: `rotate(${shown.rotation}deg)` }}
        role="img"
        aria-label={label ?? undefined}
      >
        <path d="M12 2.5 20 21 12 16.8 4 21Z" fill={ARROW_FILL} stroke="#ffffff" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </Marker>
  );
}
