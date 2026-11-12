"use client";

import { useQuery } from "@tanstack/react-query";
import { AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { Check, CircleDashed, Hexagon, MapPinned, PencilRuler, Trash2, Undo2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GeofenceMap, type GeofenceDraft } from "@/components/masters/geofence-map";
import { NewGeofenceSheet, ringOf } from "@/components/masters/screens/geofences-screen";
import { Button } from "@/components/ui/button";
import { isValidPolygon, type LatLng, type Position } from "@/lib/geofences/geometry";
import { gqlRequestPartial } from "@/lib/graphql/client";
import { GEOFENCES, type GeofencesResult } from "@/lib/graphql/geofences";
import { LIST_PAGE_SIZE } from "@/lib/graphql/vehicle-management";
import { boundsOf } from "@/lib/maplibre";
import { useVmLookups, VM_KEY } from "@/lib/vehicle-management/use-vm";
import { cn } from "@/lib/utils";

/**
 * Geofences on the live map: the toolbar (Draw / Show), the geofence shapes for both map
 * providers, and full-screen drawing. Drawing happens on the whole map; Continue then opens the
 * geofence form (name, vehicles…) without its own small map. Everything shares Vehicle
 * Management's cached geofence list, so a new geofence appears on the map straight away.
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

/** The toolbar over the live map. */
export function GeofenceToolbar({
  showing,
  loading,
  count,
  onToggle,
  onDraw,
}: {
  showing: boolean;
  loading: boolean;
  count: number;
  onToggle: () => void;
  onDraw: () => void;
}) {
  const t = useTranslations("tracking.live.geofences");
  const lookups = useVmLookups();

  if (!lookups.isSuccess || !lookups.can("geofences", "view")) return null;
  const canAdd = lookups.allow("geofences", "add");
  const addBlocked = canAdd ? undefined : lookups.companyId ? t("noPermission") : t("pickCompany");

  return (
    <div
        role="toolbar"
        aria-label={t("toolbar")}
        className="absolute end-4 top-4 z-10 flex gap-1 rounded-3xl border border-border/70 bg-surface/95 p-1.5 text-foreground shadow-xl backdrop-blur-md max-sm:start-4 max-sm:top-auto max-sm:bottom-4"
      >
        <ToolbarButton icon={<PencilRuler />} label={t("draw")} title={addBlocked} disabled={!canAdd} onClick={onDraw} />
        <ToolbarButton
          icon={<MapPinned />}
          label={showing ? t("hide") : t("show")}
          title={showing && !loading ? t("count", { count }) : undefined}
          pressed={showing}
          busy={loading}
          onClick={onToggle}
        />
    </div>
  );
}

const MAX_RADIUS_M = 100_000;
const START_DRAFT: GeofenceDraft = { type: "circle", centre: null, radiusM: 150, points: [] };

/**
 * Full-screen drawing over the live map: pick Circle or Polygon, draw on the map, then Continue to
 * the geofence form (which skips its own map). Cancelling the form comes back here with the shape
 * kept; saving calls onDone(true).
 */
export function GeofenceDrawMode({ onDone }: { onDone: (saved: boolean) => void }) {
  const t = useTranslations("tracking.live.geofences");
  const tg = useTranslations("masters.vm.geofences");
  const tc = useTranslations("masters.common");
  const { geofences } = useLiveGeofences(true);
  const others = useMemo(() => geofences.map((g) => ({ id: g.id, name: g.name, ring: g.ring })), [geofences]);
  const [draft, setDraft] = useState<GeofenceDraft>(START_DRAFT);
  const [radiusText, setRadiusText] = useState(String(START_DRAFT.radiusM));
  const [details, setDetails] = useState(false);

  const radiusOk = draft.radiusM > 0 && draft.radiusM <= MAX_RADIUS_M && Number(radiusText) === draft.radiusM;
  const ready = draft.type === "circle" ? draft.centre !== null && radiusOk : isValidPolygon(draft.points);

  return (
    <div className="absolute inset-0 z-20" role="region" aria-label={t("drawing")}>
      <GeofenceMap
        draft={draft}
        others={others}
        label={tg("mapLabel")}
        unavailable={tg("mapUnavailable")}
        frameClassName="h-full"
        onChange={(next) => {
          if (next.radiusM !== draft.radiusM) setRadiusText(String(next.radiusM));
          setDraft(next);
        }}
      />

      <div className="pointer-events-none absolute inset-x-4 top-4 flex flex-col items-center gap-2">
        <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-3xl border border-border/70 bg-surface/95 p-1.5 text-foreground shadow-xl backdrop-blur-md">
          <div role="radiogroup" aria-label={tg("type")} className="flex gap-1">
            {(["circle", "polygon"] as const).map((type) => (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={draft.type === type}
                onClick={() => setDraft((d) => ({ ...d, type }))}
                className={cn(
                  "flex h-9 cursor-pointer items-center gap-1.5 rounded-[18px] px-3.5 text-[13px] font-semibold transition-colors [&_svg]:size-4 [&_svg]:text-primary",
                  draft.type === type ? "bg-primary-soft text-primary" : "hover:bg-surface-2",
                )}
              >
                {type === "circle" ? <CircleDashed aria-hidden /> : <Hexagon aria-hidden />}
                {tg(`types.${type}`)}
              </button>
            ))}
          </div>

          <span className="h-6 w-px bg-border" aria-hidden />

          {draft.type === "circle" ? (
            <label className="flex items-center gap-2 px-1 text-[13px] text-muted-foreground">
              {tg("radius")}
              <input
                inputMode="numeric"
                dir="ltr"
                value={radiusText}
                aria-invalid={!radiusOk || undefined}
                onChange={(e) => {
                  const text = e.target.value.replace(/[^\d]/g, "");
                  setRadiusText(text);
                  const n = Number(text);
                  if (n > 0 && n <= MAX_RADIUS_M) setDraft((d) => ({ ...d, radiusM: n }));
                }}
                className="h-9 w-24 rounded-[18px] border border-border-strong bg-surface px-3 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none aria-invalid:border-destructive"
              />
            </label>
          ) : (
            <>
              <span className="px-1 text-[13px] text-muted-foreground tabular-nums">{tg("pointCount", { count: draft.points.length })}</span>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-[18px]"
                disabled={draft.points.length === 0}
                onClick={() => setDraft((d) => ({ ...d, points: d.points.slice(0, -1) }))}
              >
                <Undo2 />
                {tg("undoPoint")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-[18px] hover:text-destructive"
                disabled={draft.points.length === 0}
                onClick={() => setDraft((d) => ({ ...d, points: [] }))}
              >
                <Trash2 />
                {tg("clearPoints")}
              </Button>
            </>
          )}

          <span className="h-6 w-px bg-border" aria-hidden />

          <Button variant="secondary" size="sm" className="rounded-[18px]" onClick={() => onDone(false)}>
            <X />
            {tc("cancel")}
          </Button>
          <Button size="sm" className="rounded-[18px]" disabled={!ready} onClick={() => setDetails(true)}>
            <Check />
            {t("continue")}
          </Button>
        </div>
        <p className="pointer-events-auto max-w-xl rounded-full bg-foreground/80 px-3 py-1 text-center text-xs text-background shadow">
          {draft.type === "circle" ? tg("circleHint") : tg("polygonHint")}
        </p>
      </div>

      {details ? <NewGeofenceSheet preset={draft} onSaved={() => onDone(true)} onClose={() => setDetails(false)} /> : null}
    </div>
  );
}


function ToolbarButton({
  icon,
  label,
  title,
  pressed,
  busy,
  disabled,
  onClick,
}: {
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
      <span className={cn("grid place-items-center text-primary [&_svg]:size-5", busy && "animate-pulse")} aria-hidden>
        {icon}
      </span>
      {label}
    </button>
  );
}
