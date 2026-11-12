"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import Map, { Layer, Marker, NavigationControl, Source, useMap } from "react-map-gl/maplibre";
import { boundsOf, DEFAULT_VIEW, fitPadding, maptilerStyleUrl } from "@/lib/maplibre";
import { GeofenceLabel, geofenceBounds, type LiveGeofence } from "./live-geofences";

/**
 * Live map on OpenStreetMap (MapTiler tiles, drawn with MapLibre): the same arrows, hover cards
 * and follow behaviour as the Google version in live-tracking-view.tsx.
 */

export type OsmVehicle = { id: string; plateNo: string; lat: number | null; lng: number | null };

export function LiveOsmMap<V extends OsmVehicle>({
  maptilerKey,
  vehicles,
  selected,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  renderMarker,
  geofences = [],
  geofenceFitKey = 0,
}: {
  maptilerKey: string;
  /** Geofence outlines to draw (empty when hidden), and a counter that fits the map to them when bumped. */
  geofences?: LiveGeofence[];
  geofenceFitKey?: number;
  vehicles: V[];
  selected: V | null;
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  renderMarker: (v: V) => ReactNode;
}) {
  return (
    <Map
      initialViewState={DEFAULT_VIEW}
      mapStyle={maptilerStyleUrl(maptilerKey)}
      style={{ width: "100%", height: "100%" }}
      attributionControl={{ compact: true }}
    >
      <NavigationControl position="bottom-right" showCompass={false} />
      <FollowController selected={selected} vehicles={vehicles} />
      <OsmGeofences geofences={geofences} fitKey={geofenceFitKey} />
      {vehicles
        .filter((v) => v.lat && v.lng)
        .map((v) => {
          const isSelected = v.id === selectedId;
          const isHovered = v.id === hoveredId;
          return (
            <Marker
              key={v.id}
              latitude={v.lat!}
              longitude={v.lng!}
              anchor="center"
              // The hovered arrow's card, then the followed vehicle, sit above the others.
              style={{ zIndex: isHovered ? 3 : isSelected ? 2 : 1 }}
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                onSelect(v.id);
              }}
            >
              <div title={v.plateNo} onMouseEnter={() => onHover(v.id)} onMouseLeave={() => onHover(null)}>
                {renderMarker(v)}
              </div>
            </Marker>
          );
        })}
    </Map>
  );
}

/** Follows the selected vehicle, or fits every vehicle when none is selected. */
function FollowController({ selected, vehicles }: { selected: OsmVehicle | null; vehicles: OsmVehicle[] }) {
  const { current: map } = useMap();

  useEffect(() => {
    if (!map) return;
    if (selected?.lat && selected.lng) {
      map.flyTo({ center: [selected.lng, selected.lat], zoom: 14, duration: 800 });
      return;
    }
    const valid = vehicles.filter((v) => v.lat && v.lng);
    if (valid.length === 1) {
      map.flyTo({ center: [valid[0].lng!, valid[0].lat!], zoom: 13, duration: 0 });
    } else if (valid.length > 1) {
      // The vehicles panel (340px + gap) floats over the start side.
      map.fitBounds(boundsOf(valid.map((v) => ({ lat: v.lat!, lng: v.lng! })))!, { padding: fitPadding(380), duration: 0, maxZoom: 15 });
    }
  }, [map, selected, vehicles]);

  return null;
}

const PRIMARY = "#0B6E69";
const INACTIVE = "#64748b";

/** Geofence outlines (teal when active, grey when not) with their names, under the vehicle arrows. */
function OsmGeofences({ geofences, fitKey }: { geofences: LiveGeofence[]; fitKey: number }) {
  const { current: map } = useMap();
  const data = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: geofences.map((g) => ({
        type: "Feature" as const,
        properties: { color: g.isActive ? PRIMARY : INACTIVE, opacity: g.isActive ? 0.14 : 0.08 },
        geometry: { type: "Polygon" as const, coordinates: [g.ring] },
      })),
    }),
    [geofences],
  );

  const fitted = useRef(0);
  useEffect(() => {
    if (!map || fitKey === fitted.current || geofences.length === 0) return;
    fitted.current = fitKey;
    const b = geofenceBounds(geofences);
    if (b) map.fitBounds(b, { padding: { ...fitPadding(380), top: 110 }, duration: 600, maxZoom: 16 });
  }, [map, geofences, fitKey]);

  return (
    <>
      <Source id="live-geofences" type="geojson" data={data}>
        <Layer id="live-geofences-fill" type="fill" paint={{ "fill-color": ["get", "color"], "fill-opacity": ["get", "opacity"] }} />
        <Layer id="live-geofences-line" type="line" paint={{ "line-color": ["get", "color"], "line-width": 2, "line-opacity": 0.9 }} />
      </Source>
      {geofences.map((g) => (
        <Marker key={g.id} latitude={g.label.lat} longitude={g.label.lng} anchor="center" style={{ zIndex: 0 }}>
          <GeofenceLabel geofence={g} />
        </Marker>
      ))}
    </>
  );
}
