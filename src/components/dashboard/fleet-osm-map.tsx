"use client";

import { useEffect, type ReactNode } from "react";
import Map, { Marker, NavigationControl, useMap } from "react-map-gl/maplibre";
import { boundsOf, DEFAULT_VIEW, fitPadding, maptilerStyleUrl } from "@/lib/maplibre";

/**
 * Dashboard fleet preview on OpenStreetMap (MapTiler tiles, MapLibre): each vehicle's latest fix,
 * fitted like the Google version in fleet-map-preview.tsx.
 */
export function FleetOsmMap<V extends { id: string; lat: number; lng: number }>({
  maptilerKey,
  vehicles,
  renderMarker,
}: {
  maptilerKey: string;
  vehicles: V[];
  renderMarker: (v: V) => ReactNode;
}) {
  return (
    <Map
      initialViewState={DEFAULT_VIEW}
      mapStyle={maptilerStyleUrl(maptilerKey)}
      style={{ width: "100%", height: "100%" }}
      attributionControl={{ compact: true }}
      cooperativeGestures
    >
      <NavigationControl position="bottom-right" showCompass={false} />
      {vehicles.map((v) => (
        <Marker key={v.id} latitude={v.lat} longitude={v.lng} anchor="top-left" offset={[-16, -16]}>
          {renderMarker(v)}
        </Marker>
      ))}
      <FitToFleet vehicles={vehicles} />
    </Map>
  );
}

function FitToFleet({ vehicles }: { vehicles: Array<{ lat: number; lng: number }> }) {
  const { current: map } = useMap();
  useEffect(() => {
    if (!map || vehicles.length === 0) return;
    if (vehicles.length === 1) {
      map.jumpTo({ center: [vehicles[0].lng, vehicles[0].lat], zoom: 13 });
      return;
    }
    map.fitBounds(boundsOf(vehicles)!, { padding: fitPadding(), duration: 0, maxZoom: 15 });
  }, [map, vehicles]);
  return null;
}
