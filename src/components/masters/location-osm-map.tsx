"use client";

import { MapPin } from "lucide-react";
import { useEffect } from "react";
import Map, { Marker, NavigationControl, useMap } from "react-map-gl/maplibre";
import { DEFAULT_VIEW, maptilerStyleUrl } from "@/lib/maplibre";

const round = (n: number) => String(Math.round(n * 1e6) / 1e6);

/**
 * The location picker's map on OpenStreetMap (MapTiler tiles, MapLibre): click the map or drag the
 * pin to set the coordinates, like the Google version in location-picker.tsx.
 */
export function LocationOsmMap({
  maptilerKey,
  pin,
  onChange,
  disabled,
  label,
}: {
  maptilerKey: string;
  /** The current pin, or null when the coordinates are empty or invalid. */
  pin: { lat: number; lng: number } | null;
  onChange: (lat: string, lng: string) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div className="h-56 w-full overflow-hidden rounded-ctl border border-border bg-surface-2" role="application" aria-label={label}>
      <Map
        initialViewState={pin ? { latitude: pin.lat, longitude: pin.lng, zoom: 14 } : DEFAULT_VIEW}
        mapStyle={maptilerStyleUrl(maptilerKey)}
        style={{ width: "100%", height: "100%" }}
        attributionControl={{ compact: true }}
        cursor={disabled ? "default" : "crosshair"}
        onClick={disabled ? undefined : (e) => onChange(round(e.lngLat.lat), round(e.lngLat.lng))}
      >
        <NavigationControl position="bottom-right" showCompass={false} />
        <FollowPin pin={pin} />
        {pin ? (
          <Marker
            latitude={pin.lat}
            longitude={pin.lng}
            anchor="bottom"
            draggable={!disabled}
            onDragEnd={(e) => onChange(round(e.lngLat.lat), round(e.lngLat.lng))}
          >
            <MapPin className="size-8 fill-destructive text-white drop-shadow-md" strokeWidth={1.5} aria-hidden />
          </Marker>
        ) : null}
      </Map>
    </div>
  );
}

/** Pans to the pin when the coordinates change (typed in, or set by a click). */
function FollowPin({ pin }: { pin: { lat: number; lng: number } | null }) {
  const { current: map } = useMap();
  const lat = pin?.lat;
  const lng = pin?.lng;
  useEffect(() => {
    if (!map || lat === undefined || lng === undefined) return;
    map.panTo([lng, lat]);
  }, [map, lat, lng]);
  return null;
}
