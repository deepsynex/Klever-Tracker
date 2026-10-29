"use client";

import { MapPin, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { loadGoogleMaps } from "@/lib/google-maps";
import { numberOrNull } from "@/lib/vehicle-management/helpers";

/** The parts of the Maps API used here (the global `window.google` type only covers the history map). */
type LatLngLike = { lat: () => number; lng: () => number };
type PinMarker = { setPosition: (p: unknown) => void; setMap: (m: unknown) => void; addListener: (e: string, h: () => void) => void; getPosition: () => LatLngLike };
type PinMap = { panTo: (p: unknown) => void; setZoom: (z: number) => void; addListener: (e: string, h: (ev: { latLng: LatLngLike }) => void) => void };
type MapsApi = {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => PinMap;
  Marker: new (opts: Record<string, unknown>) => PinMarker;
};

/** Dubai, where the map opens when no pin is set. */
const DEFAULT_CENTER = { lat: 25.2048, lng: 55.2708 };
const round = (n: number) => String(Math.round(n * 1e6) / 1e6);

/**
 * "Mark location": click the map (or drag the pin) to set latitude and longitude, or type them.
 * Without a Maps key only the two inputs are shown.
 */
export function LocationPicker({
  lat,
  lng,
  onChange,
  errors = {},
  disabled,
}: {
  lat: string;
  lng: string;
  onChange: (lat: string, lng: string) => void;
  errors?: { lat?: string; lng?: string };
  disabled?: boolean;
}) {
  const t = useTranslations("masters.common.location");
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<PinMap | null>(null);
  const markerRef = useRef<PinMarker | null>(null);
  const onChangeRef = useRef(onChange);
  const [failed, setFailed] = useState(false);
  // Set once the map exists, so a pin that was already filled in is drawn when it appears.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Create the map once.
  useEffect(() => {
    if (!apiKey || !boxRef.current) return;
    let cancelled = false;
    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !boxRef.current) return;
        const maps = (window.google as unknown as { maps: MapsApi }).maps;
        const map = new maps.Map(boxRef.current, {
          center: DEFAULT_CENTER,
          zoom: 10,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });
        const marker = new maps.Marker({ map: null, draggable: !disabled });
        marker.addListener("dragend", () => {
          const p = marker.getPosition();
          onChangeRef.current(round(p.lat()), round(p.lng()));
        });
        if (!disabled) map.addListener("click", (ev) => onChangeRef.current(round(ev.latLng.lat()), round(ev.latLng.lng())));
        mapRef.current = map;
        markerRef.current = marker;
        setFailed(false);
        setReady(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [apiKey, disabled]);

  // Keep the pin in step with the inputs.
  const latN = numberOrNull(lat);
  const lngN = numberOrNull(lng);
  const valid = latN !== null && lngN !== null && Math.abs(latN) <= 90 && Math.abs(lngN) <= 180;
  useEffect(() => {
    const marker = markerRef.current;
    if (!ready || !marker) return;
    if (valid) {
      marker.setPosition({ lat: latN, lng: lngN });
      marker.setMap(mapRef.current);
      mapRef.current?.panTo({ lat: latN, lng: lngN });
    } else marker.setMap(null);
  }, [ready, valid, latN, lngN]);

  return (
    <div className="grid gap-2">
      {apiKey && !failed ? (
        <div ref={boxRef} className="h-56 w-full overflow-hidden rounded-ctl border border-border bg-surface-2" role="application" aria-label={t("map")} />
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-40">
          <Field id="loc-lat" label={t("lat")} error={errors.lat}>
            <Input id="loc-lat" inputMode="decimal" dir="ltr" value={lat} disabled={disabled} onChange={(e) => onChange(e.target.value, lng)} />
          </Field>
        </div>
        <div className="w-40">
          <Field id="loc-lng" label={t("lng")} error={errors.lng}>
            <Input id="loc-lng" inputMode="decimal" dir="ltr" value={lng} disabled={disabled} onChange={(e) => onChange(lat, e.target.value)} />
          </Field>
        </div>
        {lat || lng ? (
          <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange("", "")} className="hover:text-destructive">
            <X />
            {t("clear")}
          </Button>
        ) : null}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-subtle">
        <MapPin className="size-3.5" aria-hidden />
        {apiKey && !failed ? t("hint") : t("noMap")}
      </p>
    </div>
  );
}
