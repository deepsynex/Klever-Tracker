"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Map, { Layer, Marker, NavigationControl, Source, useMap } from "react-map-gl/maplibre";
import { boundsOf, DEFAULT_VIEW, fitPadding, maptilerStyleUrl } from "@/lib/maplibre";
import type { MapView } from "@/lib/map-settings";
import { OsmMapViewControl } from "./map-view-switch";
import { clusterPoints } from "@/lib/live/cluster";
import { GeofenceLabel, geofenceBounds, type LiveGeofence } from "./live-geofences";
import { ClusterBubble, type LiveStatus } from "./vehicle-marker";

/**
 * Live map on OpenStreetMap (MapTiler tiles, drawn with MapLibre): the same arrows, hover cards
 * and follow behaviour as the Google version in live-tracking-view.tsx.
 */

export type OsmVehicle = { id: string; plateNo: string; lat: number | null; lng: number | null; status: LiveStatus };

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
  clusterLabel,
  panelPx,
  mapView = "map",
  onMapView,
}: {
  /** Map or satellite (MapTiler's hybrid style), and the switch's handler. */
  mapView?: MapView;
  onMapView?: (view: MapView) => void;
  /** Tooltip for a bubble of nearby vehicles ("5 vehicles"). */
  clusterLabel: (count: number) => string;
  /** Room to leave on the start side when fitting, for the Vehicles & Drivers panel (0 when closed). */
  panelPx: () => number;
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
      mapStyle={maptilerStyleUrl(maptilerKey, mapView)}
      style={{ width: "100%", height: "100%" }}
      attributionControl={{ compact: true }}
    >
      <NavigationControl position="bottom-right" showCompass={false} />
      {onMapView ? <OsmMapViewControl view={mapView} onView={onMapView} /> : null}
      <FollowController selected={selected} vehicles={vehicles} panelPx={panelPx} />
      <OsmGeofences geofences={geofences} fitKey={geofenceFitKey} />
      <OsmVehicles
        vehicles={vehicles}
        selectedId={selectedId}
        hoveredId={hoveredId}
        onSelect={onSelect}
        onHover={onHover}
        renderMarker={renderMarker}
        clusterLabel={clusterLabel}
      />
    </Map>
  );
}

/** Follows the selected vehicle, or fits every vehicle when none is selected. */
function FollowController({ selected, vehicles, panelPx }: { selected: OsmVehicle | null; vehicles: OsmVehicle[]; panelPx: () => number }) {
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
      // The Vehicles & Drivers panel (340px + gap), when open, floats over the start side.
      map.fitBounds(boundsOf(valid.map((v) => ({ lat: v.lat!, lng: v.lng! })))!, { padding: fitPadding(panelPx()), duration: 0, maxZoom: 15 });
    }
  }, [map, selected, vehicles, panelPx]);

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

/** Each vehicle as its marker, or nearby vehicles as one numbered bubble; clicking a bubble zooms to them. */
function OsmVehicles<V extends OsmVehicle>({
  vehicles,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  renderMarker,
  clusterLabel,
}: {
  vehicles: V[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  renderMarker: (v: V) => ReactNode;
  clusterLabel: (count: number) => string;
}) {
  const { current: map } = useMap();
  const [zoom, setZoom] = useState(DEFAULT_VIEW.zoom);
  useEffect(() => {
    if (!map) return;
    const update = () => setZoom(map.getZoom());
    map.on("zoomend", update);
    return () => {
      map.off("zoomend", update);
    };
  }, [map]);
  const groups = useMemo(
    () => clusterPoints(vehicles.filter((v) => v.lat && v.lng).map((v) => ({ ...v, lat: v.lat!, lng: v.lng! })), Math.round(zoom), selectedId),
    [vehicles, zoom, selectedId],
  );

  return (
    <>
      {groups.map((g) => {
        if (g.kind === "cluster") {
          return (
            <Marker
              key={g.id}
              latitude={g.lat}
              longitude={g.lng}
              anchor="center"
              style={{ zIndex: 0 }}
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                const b = boundsOf(g.points);
                if (b) map?.fitBounds(b, { padding: 96, duration: 600, maxZoom: 16 });
              }}
            >
              <ClusterBubble counts={g.counts} label={clusterLabel(g.points.length)} />
            </Marker>
          );
        }
        const v = g.point;
        const isSelected = v.id === selectedId;
        const isHovered = v.id === hoveredId;
        return (
          <Marker
            key={v.id}
            latitude={v.lat}
            longitude={v.lng}
            anchor="center"
            // The hovered car's card, then the followed vehicle, sit above the others.
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
    </>
  );
}
