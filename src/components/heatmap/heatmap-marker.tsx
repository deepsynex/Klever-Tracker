"use client";

import { Bike, CarFront, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatInCompanyTz, useCompanyTimeZone } from "@/lib/company-time";
import { cn } from "@/lib/utils";

/** A vehicle's latest position on the heatmap (shared by the Google and OpenStreetMap maps). */
export type VehicleMapMarker = {
  id: string;
  label: string;
  kind: "truck" | "van" | "bike" | "car";
  position: { lat: number; lng: number };
  speed?: number;
  recordedAt?: string;
  totalPoints?: number;
};

/** Round coloured badge with the vehicle-type icon. */
export function VehicleMarkerIcon({ marker }: { marker: VehicleMapMarker }) {
  return (
    <div
      className={cn(
        "grid size-9 cursor-pointer place-items-center rounded-full text-white shadow-lg ring-2 ring-white transition-transform hover:scale-110",
        marker.kind === "bike" ? "bg-[#f4511e]" : marker.kind === "truck" ? "bg-[#00897b]" : "bg-[#1e88e5]",
      )}
    >
      {marker.kind === "bike" ? (
        <Bike className="size-4.5" />
      ) : marker.kind === "truck" ? (
        <Truck className="size-4.5" />
      ) : (
        <CarFront className="size-4.5" />
      )}
    </div>
  );
}

/** The marker's popup: location, last update in the company time zone, speed, points in the window. */
export function VehicleMarkerPopup({ marker }: { marker: VehicleMapMarker }) {
  const t = useTranslations("heatmap");
  const zone = useCompanyTimeZone();
  return (
    <div className="min-w-[200px] p-1 font-sans text-xs text-foreground">
      <div className="mb-1 text-sm font-bold text-[#0f4c47]">{marker.label}</div>
      <dl className="space-y-0.5 text-[11px] text-muted-foreground">
        <div>
          <dt className="inline font-semibold text-foreground">{t("popup.location")}:</dt>{" "}
          <dd className="inline" dir="ltr">
            {marker.position.lat.toFixed(5)}, {marker.position.lng.toFixed(5)}
          </dd>
        </div>
        {marker.recordedAt && (
          <div>
            <dt className="inline font-semibold text-foreground">{t("popup.lastUpdate")}:</dt>{" "}
            <dd className="inline" dir="ltr">
              {formatInCompanyTz(marker.recordedAt, zone, "dd-MM-yyyy HH:mm")}
            </dd>
          </div>
        )}
        {typeof marker.speed === "number" && (
          <div>
            <dt className="inline font-semibold text-foreground">{t("popup.speed")}:</dt>{" "}
            <dd className="inline">
              {marker.speed} {t("popup.unitKmh")}
            </dd>
          </div>
        )}
        {typeof marker.totalPoints === "number" && (
          <div>
            <dt className="inline font-semibold text-foreground">{t("summary.pointsInPeriod")}:</dt>{" "}
            <dd className="inline">{marker.totalPoints.toLocaleString("en")}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
