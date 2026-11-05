"use client";

import { useEffect, useMemo, useRef } from "react";
import Map, { FullscreenControl, Layer, Marker, NavigationControl, Source, useMap } from "react-map-gl/maplibre";
import { boundsOf, DEFAULT_VIEW } from "@/lib/maplibre";
import { useGlide, VehicleMarkerBody, type MapEntry, type Props } from "./track-map";

/**
 * Multi Tracking's map on OpenStreetMap (MapTiler tiles, drawn with MapLibre): the same trails,
 * markers, follow and fit behaviour as the Google map in track-map.tsx. Google's Map/Satellite
 * switch has no equivalent here; tiles keep a fullscreen button.
 */

const FOLLOW_ZOOM = 15;

function styleUrl(key: string, dark: boolean): string {
  return `https://api.maptiler.com/maps/${dark ? "streets-v2-dark" : "streets-v2"}/style.json?key=${encodeURIComponent(key)}`;
}

export function TrackOsmMap({ mode, entries, version, follow = true, onUserMove, fitKey = 0, dark, maptilerKey }: Props & { maptilerKey: string }) {
  return (
    <Map
      initialViewState={{ ...DEFAULT_VIEW, zoom: mode === "tile" ? FOLLOW_ZOOM : 11 }}
      mapStyle={styleUrl(maptilerKey, dark)}
      style={{ width: "100%", height: "100%" }}
      attributionControl={{ compact: true }}
      keyboard={false}
    >
      {mode === "single" ? <NavigationControl position="bottom-right" showCompass={false} /> : <FullscreenControl position="top-right" />}
      <Trails entries={entries} version={version} />
      {mode === "tile" ? (
        <TileCamera entry={entries[0]} version={version} follow={follow} onUserMove={onUserMove} />
      ) : (
        <FitCamera entries={entries} version={version} fitKey={fitKey} />
      )}
      {entries.map((e) => (e.track.latest ? <OsmVehicleMarker key={e.id} entry={e} version={version} labelled={mode === "single"} /> : null))}
    </Map>
  );
}

/** One line per vehicle, coloured like its entry. Rebuilt from the trail whenever it changes. */
function Trails({ entries, version }: { entries: MapEntry[]; version: number }) {
  const data = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: entries
        .filter((e) => e.track.trail.length > 1)
        .map((e) => ({
          type: "Feature" as const,
          properties: { color: e.color },
          geometry: { type: "LineString" as const, coordinates: e.track.trail.map((p) => [p.lng, p.lat]) },
        })),
    }),
    // The tracks are mutated in place; `version` says when.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, version],
  );
  return (
    <Source id="trails" type="geojson" data={data}>
      <Layer
        id="trails"
        type="line"
        layout={{ "line-join": "round", "line-cap": "round" }}
        paint={{ "line-color": ["get", "color"], "line-width": 4, "line-opacity": 0.9 }}
      />
    </Source>
  );
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
  const { current: map } = useMap();
  const placed = useRef(false);
  const lastTime = useRef(0);
  const latest = entry?.track.latest ?? null;

  useEffect(() => {
    if (!map || !onUserMove) return;
    map.on("dragstart", onUserMove);
    return () => {
      map.off("dragstart", onUserMove);
    };
  }, [map, onUserMove]);

  useEffect(() => {
    if (!map || !latest) return;
    if (!placed.current) {
      placed.current = true;
      lastTime.current = latest.time;
      map.jumpTo({ center: [latest.lng, latest.lat], zoom: FOLLOW_ZOOM });
      return;
    }
    if (follow && latest.time !== lastTime.current) map.easeTo({ center: [latest.lng, latest.lat], duration: 1000 });
    lastTime.current = latest.time;
  }, [map, latest, version, follow]);

  // Turning Follow back on re-centres straight away.
  const wasFollowing = useRef(follow);
  useEffect(() => {
    if (map && follow && !wasFollowing.current && latest) map.easeTo({ center: [latest.lng, latest.lat] });
    wasFollowing.current = follow;
  }, [map, follow, latest]);

  return null;
}

function FitCamera({ entries, version, fitKey }: { entries: MapEntry[]; version: number; fitKey: number }) {
  const { current: map } = useMap();
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
      map.jumpTo({ center: [points[0].lng, points[0].lat], zoom: FOLLOW_ZOOM - 1 });
      return;
    }
    map.fitBounds(boundsOf(points)!, { padding: 72, duration: 0 });
  }, [map, entries, version, fitKey]);

  return null;
}

function OsmVehicleMarker({ entry, version, labelled }: { entry: MapEntry; version: number; labelled: boolean }) {
  const latest = entry.track.latest!;
  const pos = useGlide(latest);
  return (
    <Marker
      latitude={pos.lat}
      longitude={pos.lng}
      anchor="center"
      style={{ zIndex: (latest.status ?? "offline") === "moving" ? 20 : 10 }}
    >
      <div title={entry.label}>
        <VehicleMarkerBody entry={entry} version={version} labelled={labelled} />
      </div>
    </Marker>
  );
}
