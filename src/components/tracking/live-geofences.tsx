"use client";

import { useQuery } from "@tanstack/react-query";
import { AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { MapPinned } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { ringOf } from "@/components/masters/screens/geofences-screen";
import type { LatLng, Position } from "@/lib/geofences/geometry";
import { gqlRequestPartial } from "@/lib/graphql/client";
import { GEOFENCES, type GeofencesResult } from "@/lib/graphql/geofences";
import { LIST_PAGE_SIZE } from "@/lib/graphql/vehicle-management";
import { boundsOf } from "@/lib/maplibre";
import { useVmLookups, VM_KEY } from "@/lib/vehicle-management/use-vm";
import { cn } from "@/lib/utils";

/**
 * Geofences on the live map: the toolbar (Show Geofence, then any other live-map tools) and the
 * geofence shapes for both map providers. They share Vehicle Management's cached geofence list.
 * Geofences are drawn on the Geofences page.
 */

export type LiveGeofence = {
  id: string;
  name: string;
  isActive: boolean;
  /** Closed [lng, lat] outline (circles as polygons). */
  ring: Position[];
  /** Where the name label sits: the circle's centre or the polygon's average point. */
  label: LatLng;
};

const PRIMARY = "#0B6E69";
const INACTIVE = "#64748b";

/** The company's geofences as map shapes; only fetched while they're shown. */
export function useLiveGeofences(enabled: boolean) {
  const lookups = useVmLookups();
  // Same cache entry as useVmQuery("geofences"), so saving or importing refreshes the map too.
  const query = useQuery({
    queryKey: [VM_KEY, "geofences"],
    queryFn: () => gqlRequestPartial<GeofencesResult>(GEOFENCES, { first: LIST_PAGE_SIZE }),
    enabled,
  });
  const geofences = useMemo<LiveGeofence[]>(
    () =>
      (query.data?.geofences.data ?? [])
        .filter((g) => lookups.inScope(g.companyId))
        .flatMap((g) => {
          const ring = ringOf(g);
          if (!ring) return [];
          const corners = ring.slice(0, -1);
          const label =
            g.type === "circle" && g.centreLat != null && g.centreLng != null
              ? { lat: g.centreLat, lng: g.centreLng }
              : {
                  lat: corners.reduce((s, p) => s + p[1], 0) / corners.length,
                  lng: corners.reduce((s, p) => s + p[0], 0) / corners.length,
                };
          return [{ id: g.id, name: g.name, isActive: g.isActive, ring, label }];
        }),
    [query.data, lookups],
  );
  return { geofences, loading: enabled && query.isPending };
}

/** Bounds around every geofence outline, for fitting the map. */
export function geofenceBounds(geofences: LiveGeofence[]) {
  return boundsOf(geofences.flatMap((g) => g.ring.map(([lng, lat]) => ({ lat, lng }))));
}

/** The geofence's name on the map. */
export function GeofenceLabel({ geofence }: { geofence: LiveGeofence }) {
  return (
    <span
      className={cn(
        "pointer-events-none block max-w-40 truncate rounded-full border bg-surface/95 px-2 py-0.5 text-[11px] font-semibold shadow-sm",
        geofence.isActive ? "border-primary/50 text-primary" : "border-border text-muted-foreground",
      )}
    >
      {geofence.name}
    </span>
  );
}

/** Google Maps: geofence outlines and labels, and a fit to them each time they're switched on. */
export function GoogleGeofenceLayer({ geofences, fitKey }: { geofences: LiveGeofence[]; fitKey: number }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const shapes = geofences.map(
      (g) =>
        new google.maps.Polygon({
          map,
          paths: g.ring.map(([lng, lat]) => ({ lat, lng })),
          strokeColor: g.isActive ? PRIMARY : INACTIVE,
          strokeWeight: 2,
          strokeOpacity: 0.9,
          fillColor: g.isActive ? PRIMARY : INACTIVE,
          fillOpacity: g.isActive ? 0.14 : 0.08,
          clickable: false,
        }),
    );
    return () => shapes.forEach((s) => s.setMap(null));
  }, [map, geofences]);

  const fitted = useRef(0);
  useEffect(() => {
    if (!map || fitKey === fitted.current || geofences.length === 0) return;
    fitted.current = fitKey;
    const b = geofenceBounds(geofences);
    if (!b) return;
    const rtl = document.documentElement.dir === "rtl";
    const panel = window.innerWidth >= 640 ? 380 : 0;
    map.fitBounds(
      { west: b[0][0], south: b[0][1], east: b[1][0], north: b[1][1] },
      { top: 110, bottom: 64, left: rtl ? 64 : 64 + panel, right: rtl ? 64 + panel : 64 },
    );
  }, [map, geofences, fitKey]);

  return (
    <>
      {geofences.map((g) => (
        <AdvancedMarker key={g.id} position={g.label} zIndex={0} clickable={false}>
          <GeofenceLabel geofence={g} />
        </AdvancedMarker>
      ))}
    </>
  );
}

/** The toolbar over the live map: Show Geofence (for roles that may see geofences), then `children`. */
export function GeofenceToolbar({
  showing,
  loading,
  count,
  onToggle,
  children,
}: {
  showing: boolean;
  loading: boolean;
  count: number;
  onToggle: () => void;
  /** More buttons after Show Geofence (Excessive Idling). */
  children?: ReactNode;
}) {
  const t = useTranslations("tracking.live.geofences");
  const lookups = useVmLookups();

  const geofencesAllowed = lookups.isSuccess && lookups.can("geofences", "view");
  if (!geofencesAllowed && !children) return null;

  return (
    <div
        role="toolbar"
        aria-label={t("toolbar")}
        className="absolute end-4 top-4 z-10 flex gap-1 rounded-3xl border border-border/70 bg-surface/95 p-1.5 text-foreground shadow-xl backdrop-blur-md max-sm:end-2 max-sm:top-2 max-sm:scale-90 max-sm:origin-top-right rtl:max-sm:origin-top-left"
      >
        {geofencesAllowed ? (
          <ToolbarButton
            icon={<MapPinned />}
            label={showing ? t("hide") : t("show")}
            title={showing && !loading ? t("count", { count }) : undefined}
            pressed={showing}
            busy={loading}
            onClick={onToggle}
          />
        ) : null}
        {children}
    </div>
  );
}

export function ToolbarButton({
  icon,
  label,
  title,
  pressed,
  busy,
  disabled,
  badge,
  onClick,
}: {
  /** A count on the icon (hidden at 0). */
  badge?: number;
  icon: ReactNode;
  label: string;
  title?: string;
  pressed?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        // 18px corners inside the bar's 24px (6px padding), so the curves line up.
        "flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-[18px] px-4 py-2 text-[13px] font-semibold whitespace-nowrap transition-colors sm:px-5",
        "hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
        pressed && "bg-primary-soft text-primary hover:bg-primary-soft",
      )}
    >
      <span className={cn("relative grid place-items-center text-primary [&_svg]:size-5", busy && "animate-pulse")} aria-hidden>
        {icon}
        {badge ? (
          <span className="absolute -end-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[10px] leading-none font-bold text-white ring-2 ring-surface">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </span>
      {label}
    </button>
  );
}
