"use client";

import { ControlPosition, MapControl } from "@vis.gl/react-google-maps";
import { Map as MapIcon, Satellite } from "lucide-react";
import { useTranslations } from "next-intl";
import type { MapView } from "@/lib/map-settings";
import { cn } from "@/lib/utils";

/**
 * Map | Satellite switch for the live map, for both map providers (satellite keeps road and place
 * labels).
 */

function Segmented({ view, onView }: { view: MapView; onView: (view: MapView) => void }) {
  const t = useTranslations("tracking.live.mapView");
  return (
    <div className="m-2.5 flex items-center gap-1 rounded-2xl border border-border/70 bg-surface/95 p-1 text-foreground shadow-lg backdrop-blur-md">
      <div role="radiogroup" aria-label={t("label")} className="flex gap-1">
        {(["map", "satellite"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={view === v}
            onClick={() => onView(v)}
            className={cn(
              "flex h-8 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors [&_svg]:size-3.5",
              view === v ? "bg-primary text-primary-foreground" : "hover:bg-surface-2",
            )}
          >
            {v === "map" ? <MapIcon aria-hidden /> : <Satellite aria-hidden />}
            {t(v)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Google Maps: the switch, in the map's own bottom-left control slot. */
export function GoogleMapViewControl({ view, onView }: { view: MapView; onView: (view: MapView) => void }) {
  return (
    <MapControl position={ControlPosition.LEFT_BOTTOM}>
      <Segmented view={view} onView={onView} />
    </MapControl>
  );
}

/** OpenStreetMap: the switch only (there are no street photos), floating bottom-left. */
export function OsmMapViewControl({ view, onView }: { view: MapView; onView: (view: MapView) => void }) {
  return (
    <div className="pointer-events-auto absolute start-0 bottom-6 z-[5]">
      <Segmented view={view} onView={onView} />
    </div>
  );
}
