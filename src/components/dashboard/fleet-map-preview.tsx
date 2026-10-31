"use client";

import { AdvancedMarker, APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import { Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { FleetStatus, FleetVehicle } from "@/lib/dashboard/data";
import { DUBAI_CENTER } from "@/lib/heatmap/client";
import { cn } from "@/lib/utils";

const TONE: Record<FleetStatus, string> = {
  moving: "bg-moving",
  stopped: "bg-stopped",
  offline: "bg-offline",
};

function VehicleTag({ vehicle }: { vehicle: FleetVehicle }) {
  const t = useTranslations("dashboard.map");
  return (
    <div className="flex items-start gap-1.5" dir="ltr">
      <span
        className={cn(
          "mt-1 grid size-8 place-items-center rounded-full text-white ring-4 ring-white/70 shadow-md",
          TONE[vehicle.status],
        )}
      >
        <Truck className="size-4" aria-hidden />
      </span>
      <span className="rounded-lg bg-white px-2.5 py-1.5 text-start shadow-[0_8px_20px_-8px_rgb(16_36_34/0.35)]">
        <span className="block text-[11px] font-bold leading-tight text-[#102422]">{vehicle.label}</span>
        <span
          className={cn(
            "block text-[11px] leading-tight",
            vehicle.status === "moving"
              ? "text-[#0b6e69]"
              : vehicle.status === "stopped"
                ? "text-[#dc2626]"
                : "text-[#6b7280]",
          )}
        >
          {vehicle.status === "moving" ? t("speed", { n: vehicle.speed }) : t(vehicle.status)}
        </span>
      </span>
    </div>
  );
}

function FitToFleet({ vehicles }: { vehicles: FleetVehicle[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map || vehicles.length === 0) return;
    if (vehicles.length === 1) {
      map.setCenter({ lat: vehicles[0].lat, lng: vehicles[0].lng });
      map.setZoom(13);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    vehicles.forEach((v) => bounds.extend({ lat: v.lat, lng: v.lng }));
    map.fitBounds(bounds, 64);
  }, [map, vehicles]);
  return null;
}

/**
 * Latest fix per vehicle on Google Maps, or a drawn street canvas when no Maps key is configured
 * or Google rejects it (wrong referrer, billing off).
 */
export function FleetMapPreview({ vehicles }: { vehicles: FleetVehicle[] }) {
  const t = useTranslations("dashboard.map");
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [authFailed, setAuthFailed] = useState(false);

  useEffect(() => {
    // Google's global hook for key/referrer failures; it otherwise paints its own error page.
    const w = window as Window & { gm_authFailure?: () => void };
    const previous = w.gm_authFailure;
    w.gm_authFailure = () => {
      setAuthFailed(true);
      previous?.();
    };
    return () => {
      w.gm_authFailure = previous;
    };
  }, []);

  return (
    <div className="relative h-[340px] overflow-hidden rounded-xl bg-surface-2">
      {apiKey && !authFailed ? (
        <APIProvider apiKey={apiKey}>
          <Map
            className="size-full"
            mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID"}
            defaultCenter={DUBAI_CENTER}
            defaultZoom={11}
            gestureHandling="cooperative"
            disableDefaultUI
            zoomControl
          >
            {vehicles.map((v) => (
              <AdvancedMarker key={v.id} position={{ lat: v.lat, lng: v.lng }} title={v.label}>
                <VehicleTag vehicle={v} />
              </AdvancedMarker>
            ))}
            <FitToFleet vehicles={vehicles} />
          </Map>
        </APIProvider>
      ) : (
        <CanvasFallback vehicles={vehicles} />
      )}
      {vehicles.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <p className="glass-panel rounded-full px-4 py-2 text-[13px] font-medium text-muted-foreground">
            {t("empty")}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Streets drawn in SVG with vehicles projected into the box by their coordinates. */
function CanvasFallback({ vehicles }: { vehicles: FleetVehicle[] }) {
  const lats = vehicles.map((v) => v.lat);
  const lngs = vehicles.map((v) => v.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const place = (v: FleetVehicle) => ({
    left: `${12 + (maxLng === minLng ? 0.5 : (v.lng - minLng) / (maxLng - minLng)) * 70}%`,
    top: `${15 + (maxLat === minLat ? 0.5 : (maxLat - v.lat) / (maxLat - minLat)) * 60}%`,
  });

  return (
    <>
      <svg
        viewBox="0 0 800 340"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
        aria-hidden
      >
        <rect width="800" height="340" fill="var(--surface-2)" />
        <path
          d="M330 -10 C360 90 300 160 380 220 S420 300 400 350"
          fill="none"
          stroke="#93c5fd"
          strokeWidth="14"
          opacity="0.55"
        />
        <g fill="none" stroke="var(--surface)" strokeLinecap="round">
          <path d="M0 120 L800 80" strokeWidth="8" />
          <path d="M0 250 C200 230 500 240 800 210" strokeWidth="8" />
          <path d="M140 0 L190 340" strokeWidth="6" />
          <path d="M560 0 C540 120 600 220 620 340" strokeWidth="6" />
          <path d="M0 40 L800 170" strokeWidth="3" />
          <path d="M260 0 L240 340" strokeWidth="3" />
          <path d="M700 0 L680 340" strokeWidth="3" />
        </g>
        <path d="M0 300 L800 140" fill="none" stroke="#fcd34d" strokeWidth="5" opacity="0.6" />
      </svg>
      {vehicles.map((v) => (
        <div key={v.id} className="absolute -translate-x-4 -translate-y-4" style={place(v)}>
          <VehicleTag vehicle={v} />
        </div>
      ))}
    </>
  );
}
