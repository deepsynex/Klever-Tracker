"use client";

import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { APIProvider, Map as GoogleMap } from "@vis.gl/react-google-maps";
import { History, LayoutGrid, Loader2, Map as MapIcon, Maximize2, RotateCw, Truck, X } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Alert } from "@/components/ui/alert";
import { fetchVehiclePage, fetchVehiclesById, fetchVehicleTypes, type MultiVehicle } from "@/lib/multi-tracking/api";
import {
  MAX_GRID,
  MAX_SINGLE,
  PRELOAD_OPTIONS,
  trailColor,
  type PreloadMinutes,
  type ViewMode,
} from "@/lib/multi-tracking/core";
import { cn } from "@/lib/utils";
import { Age } from "./age";
import { useMultiTrackFeed, type FeedPhase } from "./feed";
import { blocksAllMaps, MapsProblemBanner, MapUnavailable, useMapElementFailed, useMapsProblem } from "./maps-health";
import { STATUS_COLOR, TrackMap, type MapEntry } from "./track-map";
import { VehicleList, type ListRow } from "./vehicle-list";
import { useResolvedColor, VehicleTile } from "./vehicle-tile";

const SEARCH_DEBOUNCE_MS = 300;

/** True after hydration, so maps are created once with the right colour scheme. */
const noopSubscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

function prefersDark(): boolean {
  const theme = document.documentElement.dataset.theme;
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function MultiTrackingView({ userKey }: { userKey: string }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  return (
    <MotionConfig reducedMotion="user">
      <APIProvider apiKey={apiKey}>
        <Workspace userKey={userKey} apiKey={apiKey} />
      </APIProvider>
    </MotionConfig>
  );
}

function Workspace({ userKey, apiKey }: { userKey: string; apiKey: string }) {
  const t = useTranslations("multiTracking");
  const te = useTranslations("errors");
  const mounted = useMounted();
  // Quota / billing / key / load failures: explained once, and each map shows "Map unavailable".
  const mapsProblem = useMapsProblem();
  const mapsDown = blocksAllMaps(mapsProblem);
  const singleBox = useRef<HTMLDivElement>(null);
  const singleFailed = useMapElementFailed(singleBox);
  const feed = useMultiTrackFeed(userKey);
  const { selected, view, preload, tracks, version } = feed;

  // ---- Vehicle list: server-side search, paged (F1, N4) -------------------------------------
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQuery(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  const list = useInfiniteQuery({
    queryKey: ["multi-tracking", "vehicles", query],
    queryFn: ({ pageParam }) => fetchVehiclePage(query, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.lastPage ? last.page + 1 : undefined),
    // The list's status/time refresh slowly; tracked vehicles get live values from the feed.
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
  const types = useQuery({
    queryKey: ["multi-tracking", "types"],
    queryFn: fetchVehicleTypes,
    staleTime: 10 * 60_000,
    retry: false,
  });
  const typeName = useCallback((id: string | null) => (id ? (types.data?.get(id) ?? null) : null), [types.data]);

  const listed = useMemo(() => {
    const seen = new Map<string, MultiVehicle>();
    list.data?.pages.forEach((p) => p.vehicles.forEach((v) => seen.set(v.id, v)));
    return seen;
  }, [list.data]);

  // Selected vehicles that aren't on the loaded list pages (restored selection, other search).
  const missing = useMemo(() => selected.filter((id) => !listed.has(id)), [selected, listed]);
  const byId = useQuery({
    queryKey: ["multi-tracking", "by-id", missing.join(",")],
    queryFn: async () => ({ requested: missing, vehicles: await fetchVehiclesById(missing) }),
    enabled: missing.length > 0 && list.isSuccess,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
  // A restored vehicle the user can't see any more (deleted, or unassigned) leaves the selection.
  const { feed: controller } = feed;
  useEffect(() => {
    if (!byId.data || byId.isPlaceholderData) return;
    const found = new Set(byId.data.vehicles.map((v) => v.id));
    const gone = byId.data.requested.filter((id) => !found.has(id));
    if (gone.length) controller.remove(gone);
  }, [byId.data, byId.isPlaceholderData, controller]);

  const known = useMemo(() => {
    const all = new Map(listed);
    byId.data?.vehicles.forEach((v) => all.has(v.id) || all.set(v.id, v));
    return all;
  }, [listed, byId.data]);

  const rows: ListRow[] = useMemo(
    () =>
      [...listed.values()].map((v) => {
        const latest = tracks.get(v.id)?.latest;
        return { ...v, liveStatus: latest?.status ?? v.status, liveTime: latest?.time ?? v.lastPosition?.time ?? null };
      }),
    // `version`: tracks are mutated in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listed, tracks, version],
  );
  const lastPageInfo = list.data?.pages.at(-1);

  // ---- Per-tile Follow (F8) ------------------------------------------------------------------
  const [followOff, setFollowOff] = useState<Record<string, boolean>>({});
  const onFollow = useCallback((id: string, on: boolean) => setFollowOff((m) => ({ ...m, [id]: !on })), []);
  const onClose = useCallback((id: string) => controller.toggle(id, null), [controller]);

  const [fitKey, setFitKey] = useState(0);
  const dark = mounted && prefersDark();

  const singleEntries = useMemo(
    () =>
      selected.flatMap((id, i) => {
        const track = tracks.get(id);
        return track ? [{ id, label: known.get(id)?.plateNo ?? `#${id}`, color: trailColor(i), track }] : [];
      }),
    [selected, tracks, known],
  );
  const resolvedSingle = useResolvedColor<MapEntry>(singleEntries);

  return (
    <div className="grid gap-3 lg:h-full lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="flex max-h-[45dvh] min-h-[260px] flex-col lg:max-h-none lg:min-h-0">
        <VehicleList
          rows={rows}
          total={lastPageInfo?.total ?? rows.length}
          search={search}
          onSearch={setSearch}
          loading={list.isLoading}
          failed={list.isError}
          hasMore={list.hasNextPage}
          loadingMore={list.isFetchingNextPage}
          onLoadMore={() => void list.fetchNextPage()}
          selected={selected}
          view={view}
          typeName={typeName}
          onToggle={(row) => controller.toggle(row.id, row.lastPosition)}
          onClearAll={() => controller.clearAll()}
        />
      </div>

      <div className="flex min-h-0 flex-col gap-3">
        <Toolbar
          view={view}
          onView={(v) => controller.setView(v)}
          preload={preload}
          onPreload={(p) => controller.setPreload(p)}
          phase={feed.phase}
          lastPollAt={feed.lastPollAt}
          errorText={feed.error ? te(feed.error) : null}
          onRetry={() => controller.retry()}
          onFit={view === "single" && selected.length > 1 ? () => setFitKey((k) => k + 1) : undefined}
        />

        <Notice notice={feed.notice} onDismiss={() => controller.dismissNotice()} />
        {apiKey && mapsProblem ? <MapsProblemBanner problem={mapsProblem} /> : null}

        <div className="relative min-h-0 flex-1">
          {!apiKey ? (
            <Alert tone="warning">{t("noApiKey")}</Alert>
          ) : !feed.restored || !mounted ? (
            <div className="h-full min-h-[300px] animate-pulse rounded-2xl bg-surface-2" />
          ) : view === "grid" ? (
            // TouchTraks layout: a blurred map behind floating windows, each ¼ width × ⅓ height,
            // filling from the bottom-right corner leftwards, then up (4 × 3 = 12).
            <div className="relative isolate overflow-hidden rounded-2xl lg:h-full lg:border lg:border-border/60">
              {mapsDown ? null : <BackgroundMap dark={dark} />}
              {selected.length === 0 ? (
                <EmptyState overlay />
              ) : (
                <div className="relative flex flex-col gap-3 lg:absolute lg:inset-0 lg:flex-row-reverse lg:flex-wrap-reverse lg:content-start lg:gap-0 lg:p-1.5">
                  <AnimatePresence initial={false}>
                    {selected.map((id) => {
                      const v = known.get(id);
                      const track = tracks.get(id);
                      if (!track) return null;
                      return (
                        <motion.div
                          key={id}
                          className="h-[300px] min-h-0 lg:h-1/3 lg:w-1/4 lg:p-1.5"
                          initial={{ opacity: 0, y: 18, rotateX: 10, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ type: "spring", stiffness: 220, damping: 24 }}
                          style={{ transformOrigin: "50% 100%" }}
                        >
                          <VehicleTile
                            id={id}
                            plate={v?.plateNo ?? `#${id}`}
                            name={v?.vehicleName ?? null}
                            typeName={typeName(v?.vehicleTypeId ?? null)}
                            track={track}
                            version={version}
                            preloading={feed.preloading.has(id)}
                            follow={!followOff[id]}
                            onFollow={onFollow}
                            onClose={onClose}
                            dark={dark}
                            mapsDown={mapsDown}
                          />
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>
          ) : selected.length === 0 ? (
            <EmptyState />
          ) : (
            <div ref={singleBox} className="float-card relative h-[70dvh] overflow-hidden lg:h-full">
              <TrackMap mode="single" entries={resolvedSingle} version={version} fitKey={fitKey} dark={dark} />
              {mapsDown || singleFailed ? <MapUnavailable /> : null}
              <Legend entries={singleEntries} version={version} onRemove={onClose} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Toolbar(props: {
  view: ViewMode;
  onView: (v: ViewMode) => void;
  preload: PreloadMinutes;
  onPreload: (p: PreloadMinutes) => void;
  phase: FeedPhase;
  lastPollAt: number | null;
  errorText: string | null;
  onRetry: () => void;
  onFit?: () => void;
}) {
  const t = useTranslations("multiTracking");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="glass-panel flex rounded-xl p-1" role="group" aria-label={t("view.label")}>
        {(["grid", "single"] as const).map((v) => {
          const Icon = v === "grid" ? LayoutGrid : MapIcon;
          return (
            <button
              key={v}
              type="button"
              aria-pressed={props.view === v}
              onClick={() => props.onView(v)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-colors",
                props.view === v
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {t(`view.${v}`)}
            </button>
          );
        })}
      </div>

      <label className="glass-panel flex h-10 items-center gap-2 rounded-xl px-3 text-[13px]">
        <History className="size-4 text-primary" aria-hidden />
        <span className="text-muted-foreground">{t("preload.label")}</span>
        <select
          value={props.preload}
          onChange={(e) => props.onPreload(Number(e.target.value) as PreloadMinutes)}
          className="bg-transparent font-semibold outline-none"
        >
          {PRELOAD_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m === 0 ? t("preload.off") : t("preload.min", { n: m })}
            </option>
          ))}
        </select>
      </label>

      {props.onFit ? (
        <button
          type="button"
          onClick={props.onFit}
          className="glass-panel flex h-10 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold hover:text-primary"
        >
          <Maximize2 className="size-4" aria-hidden />
          {t("single.fitAll")}
        </button>
      ) : null}

      <FeedPill {...props} />
    </div>
  );
}

function FeedPill({
  phase,
  lastPollAt,
  errorText,
  onRetry,
}: {
  phase: FeedPhase;
  lastPollAt: number | null;
  errorText: string | null;
  onRetry: () => void;
}) {
  const t = useTranslations("multiTracking.feed");
  const tone =
    phase === "live"
      ? "text-moving"
      : phase === "retrying"
        ? "text-idle"
        : phase === "failed"
          ? "text-stopped"
          : "text-muted-foreground";
  return (
    <div
      className={cn(
        "glass-panel ms-auto flex h-10 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold",
        tone,
      )}
      role="status"
      aria-live="polite"
    >
      <span className="relative grid size-3 place-items-center" aria-hidden>
        {phase === "live" ? <span className="absolute size-2.5 rounded-full bg-current animate-ping-soft" /> : null}
        {phase === "retrying" ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <span className="size-2.5 rounded-full bg-current" />
        )}
      </span>
      <span>{t(phase)}</span>
      {phase === "live" && lastPollAt ? (
        <span className="font-normal text-muted-foreground">
          {t("updated")} <Age time={lastPollAt} />
        </span>
      ) : null}
      {(phase === "failed" || phase === "retrying") && errorText ? (
        <span className="max-w-64 truncate font-normal text-muted-foreground" title={errorText}>
          {errorText}
        </span>
      ) : null}
      {phase === "failed" ? (
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-foreground hover:bg-surface-3"
        >
          <RotateCw className="size-3" aria-hidden />
          {t("retry")}
        </button>
      ) : null}
    </div>
  );
}

function Notice({ notice, onDismiss }: { notice: { kind: string; at: number } | null; onDismiss: () => void }) {
  const t = useTranslations("multiTracking.notice");
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(onDismiss, 6000);
    return () => clearTimeout(id);
  }, [notice, onDismiss]);

  return (
    <AnimatePresence>
      {notice ? (
        <motion.div
          key={notice.at}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="flex items-center gap-2 rounded-xl border border-idle/40 bg-idle/10 px-3 py-2 text-[13px]"
          role="alert"
        >
          <span className="flex-1">
            {t(notice.kind, { max: notice.kind === "singleLimit" ? MAX_SINGLE : MAX_GRID })}
          </span>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t("dismiss")}
            className="grid size-6 place-items-center rounded-md hover:bg-surface-2"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function Legend({
  entries,
  version,
  onRemove,
}: {
  entries: MapEntry[];
  version: number;
  onRemove: (id: string) => void;
}) {
  const t = useTranslations("multiTracking");
  void version; // tracks are mutated in place
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
      <ul
        className="glass-panel pointer-events-auto flex max-h-32 max-w-full flex-wrap gap-1.5 overflow-y-auto rounded-2xl p-2"
        aria-label={t("single.legend")}
      >
        {entries.map((e) => {
          const status = e.track.latest?.status ?? "offline";
          return (
            <li
              key={e.id}
              className="flex items-center gap-1.5 rounded-full bg-surface/80 py-1 ps-2 pe-1 text-[11px] font-semibold"
            >
              <span className="h-1 w-4 rounded-full" style={{ background: e.color }} aria-hidden />
              <span dir="ltr">{e.label}</span>
              <span
                className="size-1.5 rounded-full"
                style={{ background: STATUS_COLOR[status] }}
                title={t(`status.${status}`)}
              />
              <button
                type="button"
                onClick={() => onRemove(e.id)}
                aria-label={t("tile.closeNamed", { plate: e.label })}
                className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The static, blurred backdrop of the grid view (desktop only; not interactive). */
function BackgroundMap({ dark }: { dark: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  // If Google fails this map too, drop it rather than show its blurred error box.
  const failed = useMapElementFailed(box);
  return (
    <div
      ref={box}
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 hidden scale-[1.03] blur-[3px] lg:block",
        failed && "invisible",
      )}
      aria-hidden
    >
      <GoogleMap
        className="size-full"
        mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID"}
        colorScheme={dark ? "DARK" : "LIGHT"}
        defaultCenter={{ lat: 25.6, lng: 54.2 }}
        defaultZoom={7}
        gestureHandling="none"
        disableDefaultUI
        keyboardShortcuts={false}
        clickableIcons={false}
      />
    </div>
  );
}

function EmptyState({ overlay = false }: { overlay?: boolean }) {
  const t = useTranslations("multiTracking.empty");
  return (
    <div
      className={cn(
        "relative grid h-full min-h-[320px] place-items-center overflow-hidden p-6",
        !overlay && "rounded-2xl border border-dashed border-border-strong/60 bg-surface-2/40",
      )}
    >
      {!overlay ? (
        <div
          className="pointer-events-none absolute inset-0 grid grid-cols-4 grid-rows-3 gap-3 p-4 opacity-40"
          aria-hidden
        >
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} className="rounded-xl border border-border/60 bg-surface/50" />
          ))}
        </div>
      ) : null}
      <motion.div
        initial={{ opacity: 0, y: 16, rotateX: 12 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ type: "spring", stiffness: 150, damping: 20 }}
        className="glass-panel relative max-w-sm rounded-2xl p-6 text-center"
      >
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">
          <Truck className="size-6" aria-hidden />
        </span>
        <h2 className="mt-3 text-base font-bold">{t("title")}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">{t("body", { grid: MAX_GRID, single: MAX_SINGLE })}</p>
      </motion.div>
    </div>
  );
}
