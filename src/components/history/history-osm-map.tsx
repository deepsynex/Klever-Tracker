"use client";

import type { FeatureCollection, LineString } from "geojson";
import { useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, Marker, NavigationControl, Popup, Source, useMap, type MapRef } from "react-map-gl/maplibre";
import type { PositionHistoryPoint } from "@/lib/graphql/operations";
import { formatInCompanyTz } from "@/lib/company-time";
import { IGNITION_OFF, IGNITION_ON, nearestFixIndex } from "@/lib/history/trip-events";
import { bearing, buildPlaybackTrack, positionAt, splitIntoSegments, type Fix } from "@/lib/history/road-path";
import { boundsOf, DEFAULT_VIEW, fitPadding, maptilerStyleUrl } from "@/lib/maplibre";
import type { MapProps } from "./google-map-view";

/**
 * History map on OpenStreetMap (MapTiler tiles, drawn with MapLibre): the same track, route
 * overlay, start/end and event pins and playback arrow as the Google version. Road snapping is a
 * Google Routes API feature, so here the track is always the GPS fixes.
 */

type OsmProps = Omit<MapProps, "snapToRoads" | "onRoadSnapUnavailable"> & { maptilerKey: string };

/** GPS rows → timed fixes. Klever timestamps are UTC, as "YYYY-MM-DD HH:mm:ss" or ISO. */
function toFixes(points: PositionHistoryPoint[]): Fix[] {
  return points.map((p) => {
    const iso = p.recordedAt.includes("T") ? p.recordedAt : `${p.recordedAt.replace(" ", "T")}Z`;
    const time = Date.parse(iso);
    return { lat: p.locationLat!, lng: p.locationLng!, ...(Number.isNaN(time) ? {} : { time }) };
  });
}

const usable = (p: PositionHistoryPoint) =>
  p.locationLat != null && p.locationLng != null && p.locationLat !== 0 && p.locationLng !== 0 && !isNaN(p.locationLat) && !isNaN(p.locationLng);

function eventColor(code: string): string {
  return code === IGNITION_ON ? "#16A34A" : code === IGNITION_OFF ? "#6B7280" : code === "overspeed" ? "#DC2626" : "#D97706";
}

export function HistoryOsmMap({
  maptilerKey,
  points,
  activeIndex,
  routePoints = [],
  events = [],
  eventLabel,
  timeZone = "Asia/Dubai",
  followVehicle = true,
  stepDurationMs = 0,
  focusedSegment = null,
  fullscreen = false,
}: OsmProps) {
  const validPoints = useMemo(() => points.filter(usable), [points]);
  const segmentStart = focusedSegment?.startIndex ?? null;
  const segmentEnd = focusedSegment?.endIndex ?? null;
  const displayPoints = useMemo(
    () => (segmentStart === null || segmentEnd === null ? validPoints : validPoints.slice(segmentStart, segmentEnd + 1)),
    [validPoints, segmentStart, segmentEnd],
  );
  const fixes = useMemo(() => toFixes(displayPoints), [displayPoints]);

  // One line per segment: no line across a GPS glitch or data gap (same as the Google map).
  const track = useMemo<FeatureCollection<LineString>>(
    () => ({
      type: "FeatureCollection",
      features: splitIntoSegments(fixes)
        .filter((indices) => indices.length > 1)
        .map((indices) => ({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: indices.map((i) => [fixes[i].lng, fixes[i].lat]) },
        })),
    }),
    [fixes],
  );

  const routeCoords = useMemo(
    () => routePoints.filter((rp) => rp.locationLat != null && rp.locationLng != null),
    [routePoints],
  );
  const route = useMemo<FeatureCollection<LineString>>(
    () => ({
      type: "FeatureCollection",
      features:
        routeCoords.length > 1
          ? [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: routeCoords.map((rp) => [rp.locationLng!, rp.locationLat!]) },
              },
            ]
          : [],
    }),
    [routeCoords],
  );

  const pins = useMemo(
    () =>
      events.flatMap((ev) => {
        const near = ev.lat == null || ev.lng == null ? displayPoints[nearestFixIndex(displayPoints, ev.occurredAt)] : null;
        const lat = ev.lat ?? near?.locationLat;
        const lng = ev.lng ?? near?.locationLng;
        if (!lat || !lng) return [];
        return [{ ev, lat, lng, speed: ev.speed ?? near?.speed ?? null }];
      }),
    [events, displayPoints],
  );
  const [openPin, setOpenPin] = useState<string | null>(null);

  const start = displayPoints[0];
  const end = displayPoints.length > 1 ? displayPoints[displayPoints.length - 1] : null;

  return (
    <div className={fullscreen ? "relative h-full w-full" : "relative h-[500px] w-full overflow-hidden rounded-lg border border-border lg:h-[600px]"}>
      <Map
        initialViewState={DEFAULT_VIEW}
        mapStyle={maptilerStyleUrl(maptilerKey)}
        style={{ width: "100%", height: "100%" }}
        attributionControl={{ compact: true }}
      >
        <NavigationControl position="bottom-right" showCompass={false} />
        <FitToTrack points={displayPoints} routePoints={routeCoords} fullscreen={fullscreen} />

        <Source id="history-route" type="geojson" data={route}>
          <Layer id="history-route-line" type="line" paint={{ "line-color": "#A8782A", "line-opacity": 0.65, "line-width": 4 }} />
        </Source>
        <Source id="history-track" type="geojson" data={track}>
          <Layer
            id="history-track-line"
            type="line"
            layout={{ "line-join": "round", "line-cap": "round" }}
            paint={{ "line-color": "#0B6E69", "line-opacity": 0.9, "line-width": 5 }}
          />
        </Source>

        {routeCoords.map((rp) => (
          <Marker key={`route-${rp.sequence}-${rp.locationLat}`} latitude={rp.locationLat!} longitude={rp.locationLng!} anchor="center">
            <span
              title={rp.address || `Stop #${rp.sequence}`}
              className="grid size-5 place-items-center rounded-full border-2 border-white bg-[#A8782A] text-[11px] font-bold text-white shadow"
            >
              {rp.sequence}
            </span>
          </Marker>
        ))}

        {start ? (
          <Marker latitude={start.locationLat!} longitude={start.locationLng!} anchor="center">
            <Dot color="#16A34A" size={16} title={`Start: ${start.recordedAt}`} />
          </Marker>
        ) : null}
        {end ? (
          <Marker latitude={end.locationLat!} longitude={end.locationLng!} anchor="center">
            <Dot color="#DC2626" size={16} title={`End: ${end.recordedAt}`} />
          </Marker>
        ) : null}

        {pins.map(({ ev, lat, lng }) => {
          const name = eventLabel?.(ev.code, ev.eventTypeId) ?? ev.code;
          return (
            <Marker
              key={ev.id}
              latitude={lat}
              longitude={lng}
              anchor="center"
              style={{ zIndex: 5 }}
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setOpenPin(ev.id);
              }}
            >
              <Dot
                color={eventColor(ev.code)}
                size={12}
                title={`${name} · ${formatInCompanyTz(ev.occurredAt, timeZone, "dd-MM-yyyy HH:mm:ss")}`}
                clickable
              />
            </Marker>
          );
        })}
        {(() => {
          const pin = pins.find((p) => p.ev.id === openPin);
          if (!pin) return null;
          // Plain text in JSX (escaped by React): event names come from the API.
          return (
            <Popup latitude={pin.lat} longitude={pin.lng} anchor="bottom" offset={10} onClose={() => setOpenPin(null)} closeOnClick>
              <div className="text-xs leading-normal text-[#102422]">
                <strong>{eventLabel?.(pin.ev.code, pin.ev.eventTypeId) ?? pin.ev.code}</strong>
                <div>{formatInCompanyTz(pin.ev.occurredAt, timeZone, "dd-MM-yyyy HH:mm:ss")}</div>
                {pin.speed != null ? <div>{Math.round(pin.speed)} km/h</div> : null}
                {pin.ev.externalVoltageMv != null ? <div>{(pin.ev.externalVoltageMv / 1000).toFixed(1)} V</div> : null}
              </div>
            </Popup>
          );
        })()}

        <PlaybackArrow
          fixes={fixes}
          activeIndex={activeIndex}
          segmentStart={segmentStart}
          followVehicle={followVehicle}
          stepDurationMs={stepDurationMs}
        />
      </Map>
    </div>
  );
}

function Dot({ color, size, title, clickable }: { color: string; size: number; title: string; clickable?: boolean }) {
  return (
    <span
      title={title}
      className={clickable ? "block cursor-pointer rounded-full border-2 border-white shadow" : "block rounded-full border-2 border-white shadow"}
      style={{ width: size, height: size, background: color }}
    />
  );
}

/** Fits the track (and route overlay) whenever a new track is shown. */
function FitToTrack({
  points,
  routePoints,
  fullscreen,
}: {
  points: PositionHistoryPoint[];
  routePoints: Array<{ locationLat?: number | null; locationLng?: number | null }>;
  fullscreen: boolean;
}) {
  const { current: map } = useMap();
  useEffect(() => {
    if (!map) return;
    const all = [
      ...points.map((p) => ({ lat: p.locationLat!, lng: p.locationLng! })),
      ...routePoints.map((p) => ({ lat: p.locationLat!, lng: p.locationLng! })),
    ];
    const bounds = boundsOf(all);
    if (!bounds) return;
    // Full screen: clear of the parameters panel (380px + gap), the stats bar and the playback bar.
    const padding = fullscreen ? { ...fitPadding(410), top: 150, bottom: 150 } : 64;
    map.fitBounds(bounds, { padding, duration: 0, maxZoom: 16 });
  }, [map, points, routePoints, fullscreen]);
  return null;
}

/**
 * The playback arrow: jumps to the active fix, or glides there over the step's duration for one
 * step forward within a segment (as on the Google map), turning along the track.
 */
function PlaybackArrow({
  fixes,
  activeIndex,
  segmentStart,
  followVehicle,
  stepDurationMs,
}: {
  fixes: Fix[];
  activeIndex: number;
  segmentStart: number | null;
  followVehicle: boolean;
  stepDurationMs: number;
}) {
  const { current: map } = useMap();
  const playback = useMemo(() => buildPlaybackTrack(fixes, null), [fixes]);
  const [pose, setPose] = useState<{ lat: number; lng: number; heading: number } | null>(null);
  const alongRef = useRef(0);
  const indexRef = useRef<number | null>(null);
  const headingRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  // A new track starts over: the next placement is a jump, not a glide.
  useEffect(() => {
    indexRef.current = null;
    alongRef.current = 0;
  }, [playback]);

  useEffect(() => {
    if (playback.along.length === 0) return;
    const total = playback.cumulative[playback.cumulative.length - 1];
    const i = Math.min(Math.max(activeIndex - (segmentStart ?? 0), 0), playback.along.length - 1);
    const target = playback.along[i];
    const from = alongRef.current;

    const place = (distance: number, mapRef: MapRef | undefined, follow: boolean) => {
      alongRef.current = distance;
      const position = positionAt(playback, distance);
      const ahead = positionAt(playback, Math.min(distance + 8, total));
      const behind = positionAt(playback, Math.max(distance - 8, 0));
      if (ahead.lat !== position.lat || ahead.lng !== position.lng) headingRef.current = bearing(position, ahead);
      else if (behind.lat !== position.lat || behind.lng !== position.lng) headingRef.current = bearing(behind, position);
      setPose({ lat: position.lat, lng: position.lng, heading: headingRef.current });
      if (follow) mapRef?.setCenter([position.lng, position.lat]);
    };

    const steppedForward = indexRef.current === i - 1 && target > from && playback.segmentOf[i] === playback.segmentOf[i - 1];
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const firstPlacement = indexRef.current === null;
    indexRef.current = i;

    if (!steppedForward || reducedMotion || stepDurationMs <= 0) {
      // On the first placement the track has just been fitted; don't pull the view to the start.
      frameRef.current = requestAnimationFrame(() => place(target, map, followVehicle && !firstPlacement));
      return () => {
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      };
    }

    const duration = stepDurationMs * 0.9;
    const startedAt = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - startedAt) / duration);
      place(from + (target - from) * t, map, followVehicle);
      frameRef.current = t < 1 ? requestAnimationFrame(frame) : null;
    };
    frameRef.current = requestAnimationFrame(frame);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [playback, activeIndex, segmentStart, followVehicle, stepDurationMs, map]);

  if (!pose) return null;
  return (
    <Marker latitude={pose.lat} longitude={pose.lng} anchor="center" style={{ zIndex: 10 }}>
      <svg viewBox="0 0 24 24" className="size-7 drop-shadow-md" style={{ transform: `rotate(${pose.heading}deg)` }} aria-hidden>
        <path d="M12 2.5 20 21 12 16.8 4 21Z" fill="#3BB8AE" stroke="#102422" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </Marker>
  );
}
