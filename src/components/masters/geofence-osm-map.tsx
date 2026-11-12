"use client";

import { useEffect, useMemo, useRef } from "react";
import Map, { Layer, Marker, NavigationControl, Source, useMap } from "react-map-gl/maplibre";
import { boundsOf, circleRing, closeRing, haversineM, radiusHandle, roundPoint, type LatLng } from "@/lib/geofences/geometry";
import { DEFAULT_VIEW, maptilerStyleUrl } from "@/lib/maplibre";
import { FRAME, viewPoints, type GeofenceMapProps } from "./geofence-map";

const PRIMARY = "#0B6E69";

/**
 * The geofence editor's map on OpenStreetMap (MapTiler tiles, MapLibre). Circle: click to set
 * the centre, drag the centre or the radius handle (due east). Polygon: click to add points, drag
 * points to move them. Same behaviour as the Google version in geofence-map.tsx.
 */
export function GeofenceOsmMap({ draft, onChange, others, disabled, label, frameClassName = FRAME, maptilerKey }: GeofenceMapProps & { maptilerKey: string }) {
  const shape = useMemo(() => {
    if (draft.type === "circle" && draft.centre) return circleRing(draft.centre, draft.radiusM);
    if (draft.type === "polygon" && draft.points.length >= 2) return closeRing(draft.points);
    return null;
  }, [draft]);

  const shapeData = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: shape
        ? [
            draft.type === "polygon" && draft.points.length < 3
              ? { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: shape.slice(0, -1) } }
              : { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [shape] } },
          ]
        : [],
    }),
    [shape, draft.type, draft.points.length],
  );

  const othersData = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: others.map((o) => ({ type: "Feature" as const, properties: { name: o.name }, geometry: { type: "Polygon" as const, coordinates: [o.ring] } })),
    }),
    [others],
  );

  const set = (next: Partial<typeof draft>) => onChange({ ...draft, ...next });
  const handle = draft.type === "circle" && draft.centre ? radiusHandle(draft.centre, draft.radiusM) : null;

  return (
    <div className={`${frameClassName} w-full overflow-hidden bg-surface-2`} role="application" aria-label={label}>
      <Map
        initialViewState={DEFAULT_VIEW}
        mapStyle={maptilerStyleUrl(maptilerKey)}
        style={{ width: "100%", height: "100%" }}
        attributionControl={{ compact: true }}
        cursor={disabled ? "default" : "crosshair"}
        onClick={
          disabled
            ? undefined
            : (e) => {
                const p = roundPoint({ lat: e.lngLat.lat, lng: e.lngLat.lng });
                if (draft.type === "circle") set({ centre: p });
                else set({ points: [...draft.points, p] });
              }
        }
      >
        <NavigationControl position="bottom-right" showCompass={false} />
        <FitOnce draft={draft} others={others} />

        <Source id="gf-others" type="geojson" data={othersData}>
          <Layer id="gf-others-fill" type="fill" paint={{ "fill-color": "#64748b", "fill-opacity": 0.08 }} />
          <Layer id="gf-others-line" type="line" paint={{ "line-color": "#64748b", "line-opacity": 0.6, "line-width": 1 }} />
        </Source>
        <Source id="gf-shape" type="geojson" data={shapeData}>
          <Layer id="gf-shape-fill" type="fill" filter={["==", ["geometry-type"], "Polygon"]} paint={{ "fill-color": PRIMARY, "fill-opacity": 0.18 }} />
          <Layer id="gf-shape-line" type="line" paint={{ "line-color": PRIMARY, "line-width": 2 }} />
        </Source>

        {draft.type === "circle" && draft.centre ? (
          <>
            <Marker
              latitude={draft.centre.lat}
              longitude={draft.centre.lng}
              anchor="center"
              draggable={!disabled}
              onDrag={(e) => set({ centre: roundPoint({ lat: e.lngLat.lat, lng: e.lngLat.lng }) })}
              onClick={(e) => e.originalEvent.stopPropagation()}
            >
              <Dot big />
            </Marker>
            {handle && !disabled ? (
              <Marker
                latitude={handle.lat}
                longitude={handle.lng}
                anchor="center"
                draggable
                onDrag={(e) => set({ radiusM: Math.max(1, Math.round(haversineM(draft.centre!, { lat: e.lngLat.lat, lng: e.lngLat.lng }))) })}
                onClick={(e) => e.originalEvent.stopPropagation()}
              >
                <Dot handle />
              </Marker>
            ) : null}
          </>
        ) : null}

        {draft.type === "polygon"
          ? draft.points.map((p, i) => (
              <Marker
                key={i}
                latitude={p.lat}
                longitude={p.lng}
                anchor="center"
                draggable={!disabled}
                onDrag={(e) => set({ points: draft.points.map((q, j) => (j === i ? roundPoint({ lat: e.lngLat.lat, lng: e.lngLat.lng }) : q)) })}
                onClick={(e) => e.originalEvent.stopPropagation()}
              >
                <Dot />
              </Marker>
            ))
          : null}
      </Map>
    </div>
  );
}

/** A white-ringed handle: the circle centre (big), the radius handle, or a polygon point. */
function Dot({ big, handle }: { big?: boolean; handle?: boolean }) {
  return (
    <span
      className={
        handle
          ? "block size-3.5 cursor-ew-resize rounded-full border-2 border-[#0B6E69] bg-white shadow"
          : big
            ? "block size-4 cursor-move rounded-full border-2 border-white bg-[#0B6E69] shadow"
            : "block size-3 cursor-move rounded-full border-2 border-white bg-[#0B6E69] shadow"
      }
      aria-hidden
    />
  );
}

/** Fits the view once the map is ready: to the shape being edited, else to the other geofences. */
function FitOnce({ draft, others }: Pick<GeofenceMapProps, "draft" | "others">) {
  const { current: map } = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (!map || done.current) return;
    done.current = true;
    const pts: LatLng[] =
      draft.type === "circle" && draft.centre ? circleRing(draft.centre, draft.radiusM, 16).map(([lng, lat]) => ({ lat, lng })) : viewPoints(draft, others);
    const b = boundsOf(pts);
    if (!b) return;
    if (pts.length === 1) map.jumpTo({ center: [pts[0].lng, pts[0].lat], zoom: 15 });
    else map.fitBounds(b, { padding: 48, duration: 0, maxZoom: 16 });
  }, [map, draft, others]);
  return null;
}
