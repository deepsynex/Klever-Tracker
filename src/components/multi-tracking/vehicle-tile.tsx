"use client";

import { Loader2, Lock, LockOpen, MapPinOff, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useCallback, useMemo, useRef } from "react";
import type { Track } from "@/lib/multi-tracking/core";
import { cn } from "@/lib/utils";
import { Age } from "./age";
import { MapUnavailable, useMapElementFailed } from "./maps-health";
import { STATUS_COLOR, TrackMap } from "./track-map";
import { VehicleTypeIcon } from "./vehicle-icon";

type Props = {
  id: string;
  plate: string;
  name: string | null;
  typeName: string | null;
  track: Track;
  version: number;
  preloading: boolean;
  follow: boolean;
  onFollow: (id: string, on: boolean) => void;
  onClose: (id: string) => void;
  dark: boolean;
  /** No map can render on this page (key, billing, script): the window keeps its live header data. */
  mapsDown: boolean;
};

/** One selected vehicle as a floating window: title bar (plate, status, speed, age, ✕) over its own live map with Lock. */
export const VehicleTile = memo(function VehicleTile(p: Props) {
  const t = useTranslations("multiTracking");
  const latest = p.track.latest;
  const status = latest?.status ?? "offline";
  const color = STATUS_COLOR[status];
  const { id, onFollow } = p;
  const onUserMove = useCallback(() => onFollow(id, false), [onFollow, id]);
  // The track object is stable (mutated in place); `version` tells the map it changed.
  const entries = useMemo(
    () => [{ id: p.id, label: p.plate, color: "var(--primary)", track: p.track }],
    [p.id, p.plate, p.track],
  );
  const resolvedEntries = useResolvedColor(entries);
  const mapBox = useRef<HTMLDivElement>(null);
  const unavailable = useMapElementFailed(mapBox) || p.mapsDown;

  return (
    <article
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-black/10 bg-surface shadow-[0_18px_40px_-14px_rgb(0_0_0/0.45)]"
      aria-label={p.plate}
    >
      {/* Window title bar (TouchTraks style): plate · status · speed · age, close. */}
      <header className="flex h-9 shrink-0 items-center gap-2 bg-[#4a4f55] ps-2.5 pe-1 text-white dark:bg-[#2b3133]">
        <VehicleTypeIcon typeName={p.typeName} className="size-4 shrink-0 opacity-90" />
        {/* The plate always fits; status is a coloured dot (named for screen readers and on hover). */}
        <span
          className="size-2.5 shrink-0 rounded-full ring-2 ring-white/25"
          style={{ background: color }}
          title={t(`status.${status}`)}
        />
        <span className="sr-only">{t(`status.${status}`)}</span>
        <span className="shrink-0 text-[13px] font-bold" dir="ltr">
          {p.plate}
        </span>
        <span className="ms-auto flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11px] text-white/80">
          {latest && status !== "offline" ? (
            <span className="shrink-0" dir="ltr">
              {t("speed", { n: Math.round(latest.speed) })}
            </span>
          ) : null}
          <Age time={latest?.time ?? null} className="truncate [&.text-stopped]:text-red-300" />
        </span>
        <button
          type="button"
          onClick={() => p.onClose(p.id)}
          title={t("tile.close")}
          aria-label={t("tile.close")}
          className="grid size-7 shrink-0 place-items-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>
      <div ref={mapBox} className="relative min-h-0 flex-1 bg-surface-2">
        <TrackMap
          mode="tile"
          entries={resolvedEntries}
          version={p.version}
          follow={p.follow}
          onUserMove={onUserMove}
          dark={p.dark}
        />
        {unavailable ? <MapUnavailable compact /> : null}
        {unavailable ? null : (
          <button
            type="button"
            onClick={() => p.onFollow(p.id, !p.follow)}
            aria-pressed={!p.follow}
            title={t(p.follow ? "tile.lockHint" : "tile.unlockHint")}
            className={cn(
              "absolute start-2.5 top-[52px] flex h-6 items-center gap-1 rounded border px-1.5 text-[11px] font-bold shadow-sm transition-colors",
              p.follow
                ? "border-black/60 bg-white text-black hover:bg-neutral-100"
                : "border-primary bg-primary text-primary-foreground",
            )}
          >
            {p.follow ? <LockOpen className="size-3" aria-hidden /> : <Lock className="size-3" aria-hidden />}
            {t(p.follow ? "tile.lock" : "tile.locked")}
          </button>
        )}
        {!latest ? (
          <div className="absolute inset-0 grid place-items-center bg-surface/60 backdrop-blur-[2px]">
            <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              {p.preloading ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <MapPinOff className="size-4" aria-hidden />
              )}
              {t(p.preloading ? "tile.loading" : "tile.noPosition")}
            </span>
          </div>
        ) : p.preloading ? (
          <span className="glass-panel absolute bottom-2 start-2 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            {t("tile.loadingTrail")}
          </span>
        ) : null}
      </div>
    </article>
  );
});

/** Google polylines need a real colour, not a CSS variable: resolve `var(--primary)` once. */
export function useResolvedColor<T extends { color: string }>(entries: T[]): T[] {
  return useMemo(() => {
    if (typeof window === "undefined") return entries;
    const css = getComputedStyle(document.documentElement);
    return entries.map((e) => {
      const m = /^var\((--[\w-]+)\)$/.exec(e.color);
      return m ? { ...e, color: css.getPropertyValue(m[1]).trim() || "#0b6e69" } : e;
    });
  }, [entries]);
}
