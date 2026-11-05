"use client";

import Map from "react-map-gl/maplibre";
import "@/lib/maplibre";

/** The blurred, non-interactive backdrop of the Multi Tracking grid on OpenStreetMap. */
export function BackdropOsmMap({ maptilerKey, dark }: { maptilerKey: string; dark: boolean }) {
  return (
    <Map
      initialViewState={{ latitude: 25.6, longitude: 54.2, zoom: 6 }}
      mapStyle={`https://api.maptiler.com/maps/${dark ? "streets-v2-dark" : "streets-v2"}/style.json?key=${encodeURIComponent(maptilerKey)}`}
      style={{ width: "100%", height: "100%" }}
      interactive={false}
      attributionControl={false}
    />
  );
}
