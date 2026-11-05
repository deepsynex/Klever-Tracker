"use client";

import type { ReactNode } from "react";
import Map, { Marker, NavigationControl } from "react-map-gl/maplibre";
import { maptilerStyleUrl } from "@/lib/maplibre";

/**
 * One vehicle on OpenStreetMap (MapTiler tiles, drawn with MapLibre): the Detailed tracking map
 * modal's OSM version of the Google map with a single marker.
 */
export function DetailedOsmMap({ maptilerKey, lat, lng, children }: { maptilerKey: string; lat: number; lng: number; children: ReactNode }) {
  return (
    <Map
      initialViewState={{ latitude: lat, longitude: lng, zoom: 15 }}
      mapStyle={maptilerStyleUrl(maptilerKey)}
      style={{ width: "100%", height: "100%" }}
      attributionControl={{ compact: true }}
    >
      <NavigationControl position="bottom-right" showCompass={false} />
      <Marker latitude={lat} longitude={lng} anchor="center">
        {children}
      </Marker>
    </Map>
  );
}
