"use client";

import { useState, useEffect, useMemo, useCallback, useRef, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import {
  Play,
  Pause,
  RotateCcw,
  FastForward,
  Rewind,
  Calendar,
  Clock,
  Car,
  Route as RouteIcon,
  AlertTriangle,
  ListFilter,
  Layers,
  MapPin,
  CheckCircle2,
  ChevronUp,
  GripVertical,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { GoogleMapView } from "@/components/history/google-map-view";
import { useDraggablePanel } from "@/components/history/use-draggable-panel";
import { ApiRequestError, gqlRequest } from "@/lib/graphql/client";
import {
  GET_VEHICLES,
  GET_DEVICES,
  GET_ROUTES,
  GET_ROUTE_DETAIL,
  GET_EVENT_TYPES,
  type VehiclesResult,
  type DevicesResult,
  type RouteItem,
  type RoutesResult,
  type RouteDetailResult,
  type RoutePoint,
  type EventTypeItem,
  type EventTypesResult,
  type AlertEventItem,
} from "@/lib/graphql/operations";
import {
  buildTrackTargets,
  companyDate,
  companyTimeToUtcIso,
  historyFilter,
  type TrackTarget,
} from "@/lib/history/selection";
import { cleanTrack } from "@/lib/history/clean-track";
import { calculateDistance, computeRouteLegs, formatDuration, tripTimes, type RouteLeg } from "@/lib/history/legs";
import { formatInCompanyTz, useCompanyTimeZone } from "@/lib/company-time";
import { fetchHistoryFixes, fetchVehicleEventsSafely, MAX_HISTORY_FIXES, TooManyFixesError, type HistoryFix } from "@/lib/history/fetch-history";
import { IGNITION_OFF, IGNITION_ON, nearestFixIndex } from "@/lib/history/trip-events";
import { useEventLabel, useTripEvents } from "@/lib/history/use-trip-events";
import { cn } from "@/lib/utils";

/** Default window: the last 7 days in the company time zone. */
const DEFAULT_RANGE_DAYS = 6;

/**
 * Road snapping calls Google's Routes API, which must be enabled for the Maps key separately.
 * Off unless NEXT_PUBLIC_GOOGLE_ROUTES_ENABLED=true, so a key without it isn't called at all.
 */
const ROAD_SNAP_CONFIGURED = process.env.NEXT_PUBLIC_GOOGLE_ROUTES_ENABLED === "true";

export function TrackingHistoryView() {
  const t = useTranslations("history");
  const te = useTranslations("errors");
  const displayZone = useCompanyTimeZone();

  // Form fields. Dates and times are in the company time zone (Asia/Dubai).
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>(() => companyDate(DEFAULT_RANGE_DAYS));
  const [fromTime, setFromTime] = useState<string>("00:00");
  const [toDate, setToDate] = useState<string>(() => companyDate(0));
  const [toTime, setToTime] = useState<string>("23:59");
  const [selectedRouteId, setSelectedRouteId] = useState<string>("");
  const [selectedEventTypeId, setSelectedEventTypeId] = useState<string>("all");

  // Lookup data from API
  const [targets, setTargets] = useState<TrackTarget[]>([]);
  /** null while loading; then whether the company has anything to track. */
  const [hasTargets, setHasTargets] = useState<boolean | null>(null);
  const selectedTarget = useMemo(() => targets.find((x) => x.key === selectedKey) ?? null, [targets, selectedKey]);
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [routeDetail, setRouteDetail] = useState<RoutePoint[]>([]);
  const [eventTypes, setEventTypes] = useState<EventTypeItem[]>([]);
  /** The window's stored alert events (alertEvents filtered by vehicle and time). */
  const [apiEvents, setApiEvents] = useState<AlertEventItem[]>([]);

  // Telemetry Position History
  const [positions, setPositions] = useState<HistoryFix[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Playback Control & Exact Route Options State
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [followVehicle, setFollowVehicle] = useState<boolean>(true);
  const [roadSnapAvailable, setRoadSnapAvailable] = useState<boolean>(ROAD_SNAP_CONFIGURED);
  const [snapToRoads, setSnapToRoads] = useState<boolean>(ROAD_SNAP_CONFIGURED);
  const handleRoadSnapUnavailable = useCallback(() => {
    setRoadSnapAvailable(false);
    setSnapToRoads(false);
  }, []);
  const [focusedLeg, setFocusedLeg] = useState<RouteLeg | null>(null);
  const [activeTab, setActiveTab] = useState<"map" | "legs" | "points" | "events">("map");
  const [paramsOpen, setParamsOpen] = useState(true);
  // Destructured: passing a property of one object to a JSX `ref` makes the React Compiler treat the
  // whole object as a ref (and refuse reads of its other fields during render).
  const {
    attach: attachParamsPanel,
    offset: paramsOffset,
    dragging: paramsDragging,
    handleProps: paramsHandleProps,
    onHandleKeyDown: onParamsHandleKeyDown,
    reset: resetParamsPanel,
  } = useDraggablePanel<HTMLElement>("kt-history-params-position");

  // Only the latest request may update the page: an earlier, larger window (e.g. the default range
  // loaded on open) can finish after the one the user just asked for.
  const latestRequest = useRef(0);

  // Fetches every fix for a vehicle or device and window
  const fetchHistory = useCallback(
    async (target: TrackTarget | null, fDate: string, fTime: string, tDate: string, tTime: string) => {
      if (!target) return;
      const request = ++latestRequest.current;
      setIsLoading(true);
      setErrorMsg(null);
      setIsPlaying(false);
      setActiveIndex(0);
      setFocusedLeg(null);

      try {
        const from = companyTimeToUtcIso(fDate, fTime);
        const to = companyTimeToUtcIso(tDate, tTime, 59);
        // Every page of the window, oldest first (one `first: 1000` call dropped the start of busy windows).
        const [sorted, events] = await Promise.all([
          fetchHistoryFixes(historyFilter(target), from, to),
          fetchVehicleEventsSafely(target.vehicleId, from, to),
        ]);

        if (request !== latestRequest.current) return;
        setPositions(sorted);
        setApiEvents(events);
        if (sorted.length === 0) {
          setErrorMsg(t("map.noPoints"));
        }
      } catch (err: unknown) {
        if (request !== latestRequest.current) return;
        setPositions([]);
        setApiEvents([]);
        setErrorMsg(
          err instanceof TooManyFixesError
            ? t("map.tooManyPoints", { total: err.total.toLocaleString("en"), max: MAX_HISTORY_FIXES.toLocaleString("en") })
            : te(err instanceof ApiRequestError ? err.error.kind : "unknown"),
        );
      } finally {
        if (request === latestRequest.current) setIsLoading(false);
      }
    },
    [t, te],
  );

  // Fetch Initial Lookup Data on component mount
  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      try {
        const [vehiclesRes, devicesRes, routesRes, eventTypesRes] = await Promise.allSettled([
          gqlRequest<VehiclesResult>(GET_VEHICLES, { first: 100 }),
          gqlRequest<DevicesResult>(GET_DEVICES, { first: 100 }),
          gqlRequest<RoutesResult>(GET_ROUTES),
          gqlRequest<EventTypesResult>(GET_EVENT_TYPES),
        ]);

        if (cancelled) return;

        if (vehiclesRes.status === "rejected" && devicesRes.status === "rejected") {
          const reason: unknown = vehiclesRes.reason;
          setErrorMsg(te(reason instanceof ApiRequestError ? reason.error.kind : "unknown"));
          return;
        }

        // Only the company's own vehicles and devices: the API returns nothing for anyone else's.
        const loadedTargets = buildTrackTargets(
          vehiclesRes.status === "fulfilled" ? (vehiclesRes.value?.vehicles?.data ?? []) : [],
          devicesRes.status === "fulfilled" ? (devicesRes.value?.devices?.data ?? []) : [],
        );
        setTargets(loadedTargets);
        setHasTargets(loadedTargets.length > 0);
        const defaultTarget = loadedTargets[0] ?? null;
        // Only when nothing is chosen yet: a slow (or, in development, repeated) load must not
        // overwrite a vehicle the user already picked.
        setSelectedKey((current) => current || (defaultTarget?.key ?? ""));

        if (routesRes.status === "fulfilled" && routesRes.value?.routes?.data) {
          setRoutes(routesRes.value.routes.data);
        }

        if (eventTypesRes.status === "fulfilled" && eventTypesRes.value?.eventTypes?.data) {
          setEventTypes(eventTypesRes.value.eventTypes.data);
        }

        void fetchHistory(defaultTarget, companyDate(DEFAULT_RANGE_DAYS), "00:00", companyDate(0), "23:59");
      } catch (err: unknown) {
        console.error("Failed to load tracking metadata:", err);
      }
    }

    void loadInitialData();
    return () => {
      cancelled = true;
    };
  }, [fetchHistory, te]);

  // Handle Route Dropdown Selection
  const handleRouteChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const routeId = e.target.value;
    setSelectedRouteId(routeId);
    if (!routeId) {
      setRouteDetail([]);
    } else {
      gqlRequest<RouteDetailResult>(GET_ROUTE_DETAIL, { id: routeId })
        .then((res) => {
          setRouteDetail(res?.route?.points || []);
        })
        .catch((err: unknown) => {
          console.error("Failed to load route points:", err);
        });
    }
  };

  const { shown: filteredEvents } = useTripEvents(apiEvents, positions, eventTypes, selectedEventTypeId);
  const eventName = useEventLabel(eventTypes);

  // Valid fixes (non-zero lat/lng), with parked-GPS drift collapsed into one point per stop
  // (clean-track.ts): a parked tracker's scattered fixes would otherwise draw a star of fake lines.
  const validPoints = useMemo(() => {
    const valid = positions.filter(
      (p) =>
        p.locationLat != null &&
        p.locationLng != null &&
        p.locationLat !== 0 &&
        p.locationLng !== 0 &&
        !isNaN(p.locationLat) &&
        !isNaN(p.locationLng),
    );
    return cleanTrack(valid).points;
  }, [positions]);

  // Detected exact route legs used by the vehicle
  const routeLegs = useMemo(() => {
    return computeRouteLegs(validPoints);
  }, [validPoints]);

  // Planned Route Adherence calculation
  const routeAdherence = useMemo(() => {
    if (!selectedRouteId || routeDetail.length === 0 || validPoints.length === 0) return null;
    let reached = 0;
    const thresholdKm = 0.6;
    routeDetail.forEach((rp) => {
      if (rp.locationLat == null || rp.locationLng == null) return;
      const wasVisited = validPoints.some((vp) => {
        if (vp.locationLat == null || vp.locationLng == null) return false;
        return calculateDistance([rp, vp]) <= thresholdKm;
      });
      if (wasVisited) reached++;
    });
    const percentage = Math.round((reached / routeDetail.length) * 100);
    return { reached, total: routeDetail.length, percentage };
  }, [selectedRouteId, routeDetail, validPoints]);

  // Time between playback steps; the map marker glides between fixes over the same time.
  const stepDurationMs = Math.max(100, Math.floor(1000 / playbackSpeed));

  // Playback timer effect
  useEffect(() => {
    if (!isPlaying || validPoints.length === 0) return;

    const maxBoundary = focusedLeg ? focusedLeg.endIndex : validPoints.length - 1;
    const minBoundary = focusedLeg ? focusedLeg.startIndex : 0;

    const timer = setInterval(() => {
      setActiveIndex((prev) => {
        if (prev >= maxBoundary) {
          setIsPlaying(false);
          return minBoundary;
        }
        return prev + 1;
      });
    }, stepDurationMs);

    return () => clearInterval(timer);
  }, [isPlaying, stepDurationMs, validPoints.length, focusedLeg]);

  // Computed summary metrics
  const stats = useMemo(() => {
    if (validPoints.length === 0) {
      return { totalDistance: 0, maxSpeed: 0, avgSpeed: 0, spanMs: 0, drivingMs: 0, stoppedMs: 0, pointsCount: 0 };
    }

    const currentScopePoints = focusedLeg
      ? validPoints.slice(focusedLeg.startIndex, focusedLeg.endIndex + 1)
      : validPoints;

    const totalDistance = calculateDistance(currentScopePoints);
    let maxSpeed = 0;
    let sumSpeed = 0;
    let speedCount = 0;

    currentScopePoints.forEach((p) => {
      const sp = p.speed ?? 0;
      if (sp > maxSpeed) maxSpeed = sp;
      if (sp > 0) {
        sumSpeed += sp;
        speedCount++;
      }
    });

    const avgSpeed = speedCount > 0 ? Math.round(sumSpeed / speedCount) : 0;
    // Driving = the legs; stopped = the stops between them. A focused leg is all driving.
    const times = tripTimes(currentScopePoints, focusedLeg ? [focusedLeg] : routeLegs);

    return {
      totalDistance: Number(totalDistance.toFixed(1)),
      maxSpeed: Math.round(maxSpeed),
      avgSpeed,
      ...times,
      pointsCount: currentScopePoints.length,
    };
  }, [validPoints, focusedLeg, routeLegs]);

  const activePoint = validPoints[activeIndex] || validPoints[0] || null;

  // Quick ranges, in the company time zone
  const setPresetRange = (preset: "today" | "yesterday" | "last7Days") => {
    const from = companyDate(preset === "today" ? 0 : preset === "yesterday" ? 1 : DEFAULT_RANGE_DAYS);
    const to = companyDate(preset === "yesterday" ? 1 : 0);
    setFromDate(from);
    setFromTime("00:00");
    setToDate(to);
    setToTime("23:59");
    void fetchHistory(selectedTarget, from, "00:00", to, "23:59");
  };

  const dataTab = activeTab === "map" ? null : activeTab;
  const toggleTab = (tab: "legs" | "points" | "events") => setActiveTab(activeTab === tab ? "map" : tab);
  const dataTitle =
    dataTab === "legs"
      ? t("playback.routesUsed", { count: routeLegs.length })
      : dataTab === "points"
        ? `GPS Points (${validPoints.length})`
        : t("events.titleCount", { count: filteredEvents.length });

  const statItems = [
    { key: "totalDistance", value: stats.totalDistance, unit: t("stats.unitKm"), tone: "text-primary" },
    { key: "drivingTime", value: formatDuration(stats.drivingMs), tone: "text-foreground", title: t("stats.timeSpan", { value: formatDuration(stats.spanMs) }) },
    { key: "stoppedTime", value: formatDuration(stats.stoppedMs), tone: "text-muted-foreground", title: t("stats.timeSpan", { value: formatDuration(stats.spanMs) }) },
    { key: "maxSpeed", value: stats.maxSpeed, unit: t("stats.unitKmh"), tone: "text-destructive" },
    { key: "avgSpeed", value: stats.avgSpeed, unit: t("stats.unitKmh"), tone: "text-moving" },
    { key: "pointsCount", value: stats.pointsCount, tone: "text-foreground" },
    { key: "eventsCount", value: filteredEvents.length, tone: "text-sand" },
  ];

  return (
    <div className="relative h-full overflow-hidden">
      {/* The map fills the page; every control floats above it. */}
      <div className="absolute inset-0">
        <GoogleMapView
          fullscreen
          points={validPoints}
          activeIndex={activeIndex}
          onSelectPoint={setActiveIndex}
          routePoints={routeDetail}
          events={filteredEvents}
          eventLabel={eventName}
          timeZone={displayZone}
          followVehicle={followVehicle}
          snapToRoads={snapToRoads}
          onRoadSnapUnavailable={handleRoadSnapUnavailable}
          stepDurationMs={stepDurationMs}
          focusedSegment={focusedLeg ? { startIndex: focusedLeg.startIndex, endIndex: focusedLeg.endIndex } : null}
        />
      </div>

      {/* Tracking parameters: floating panel on the start side, collapsible to its title */}
      <section
        ref={attachParamsPanel}
        aria-labelledby="history-title"
        style={{ transform: `translate(${paramsOffset.x}px, ${paramsOffset.y}px)` }}
        className={cn(
          "glass-panel absolute start-3 top-3 z-20 flex max-h-[calc(100%-20rem)] flex-col rounded-2xl sm:start-4 sm:top-4 lg:max-h-[calc(100%-9rem)]",
          paramsOpen ? "w-[min(380px,calc(100%-1.5rem))]" : "w-auto",
          paramsDragging && "z-40 ring-2 ring-primary/40",
        )}
      >
        {/* The header is the drag area; the grip is its keyboard-reachable handle. */}
        <div
          {...paramsHandleProps}
          className={cn(
            "flex touch-none select-none items-start gap-2 p-4 pb-3 ps-2",
            paramsDragging ? "cursor-grabbing" : "cursor-grab",
          )}
        >
          <button
            type="button"
            data-drag-handle
            aria-label={t("panel.move")}
            title={t("panel.moveHint")}
            onKeyDown={onParamsHandleKeyDown}
            onDoubleClick={resetParamsPanel}
            className="grid h-8 w-6 shrink-0 cursor-[inherit] place-items-center rounded-md text-subtle hover:bg-surface-2 hover:text-foreground"
          >
            <GripVertical className="size-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 id="history-title" className="text-base font-semibold tracking-tight">
              {paramsOpen ? t("filters.title") : t("title")}
            </h1>
            {paramsOpen ? <p className="text-xs text-muted-foreground">{t("subtitle")}</p> : null}
          </div>
          <button
            type="button"
            aria-expanded={paramsOpen}
            aria-controls="history-params"
            title={paramsOpen ? t("panel.hide") : t("panel.show")}
            aria-label={paramsOpen ? t("panel.hide") : t("panel.show")}
            onClick={() => setParamsOpen(!paramsOpen)}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          >
            {paramsOpen ? <ChevronUp className="size-4" /> : <SlidersHorizontal className="size-4" />}
          </button>
        </div>

        {paramsOpen && (
          <div id="history-params" className="grid min-h-0 gap-3 overflow-y-auto px-4 pb-4">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("filters.quickRanges")}>
              {(["today", "yesterday", "last7Days"] as const).map((preset) => (
                <Button
                  key={preset}
                  variant="secondary"
                  size="sm"
                  className="h-7 rounded-full px-3 text-xs"
                  disabled={!selectedTarget || isLoading}
                  onClick={() => setPresetRange(preset)}
                >
                  {t(`filters.${preset}`)}
                </Button>
              ))}
            </div>

            {hasTargets === false && (
              <Alert tone="warning">
                <strong className="font-semibold">{t("filters.noTargetsTitle")}</strong> {t("filters.noTargetsBody")}
              </Alert>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void fetchHistory(selectedTarget, fromDate, fromTime, toDate, toTime);
              }}
              className="grid gap-3"
            >
              <div className="grid grid-cols-2 gap-3">
                {/* 1. Vehicle / Device Dropdown */}
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="vehicle-select" className="flex items-center gap-1.5 text-xs font-medium">
                    <Car className="size-3.5 text-primary" />
                    {t("filters.vehicle")}
                  </Label>
                  <Select
                    id="vehicle-select"
                    value={selectedKey}
                    disabled={!hasTargets}
                    onChange={(e) => {
                      setSelectedKey(e.target.value);
                      const next = targets.find((x) => x.key === e.target.value) ?? null;
                      void fetchHistory(next, fromDate, fromTime, toDate, toTime);
                    }}
                  >
                    {!hasTargets && (
                      <option value="">
                        {hasTargets === null ? t("filters.loadingTargets") : t("filters.noTargetsTitle")}
                      </option>
                    )}
                    {(["vehicle", "device"] as const).map((kind) => {
                      const group = targets.filter((x) => x.kind === kind);
                      if (group.length === 0) return null;
                      return (
                        <optgroup
                          key={kind}
                          label={t(kind === "vehicle" ? "filters.vehiclesGroup" : "filters.devicesGroup")}
                        >
                          {group.map((x) => (
                            <option key={x.key} value={x.key} dir="ltr">
                              {x.label}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </Select>
                </div>

                {/* 2. From Date */}
                <div className="space-y-1.5">
                  <Label htmlFor="from-date" className="flex items-center gap-1.5 text-xs font-medium">
                    <Calendar className="size-3.5 text-subtle" />
                    {t("filters.fromDate")}
                  </Label>
                  <Input
                    id="from-date"
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    required
                  />
                </div>

                {/* 3. From Time */}
                <div className="space-y-1.5">
                  <Label htmlFor="from-time" className="flex items-center gap-1.5 text-xs font-medium">
                    <Clock className="size-3.5 text-subtle" />
                    {t("filters.fromTime")}
                  </Label>
                  <Input
                    id="from-time"
                    type="time"
                    value={fromTime}
                    onChange={(e) => setFromTime(e.target.value)}
                    required
                  />
                </div>

                {/* 4. To Date */}
                <div className="space-y-1.5">
                  <Label htmlFor="to-date" className="flex items-center gap-1.5 text-xs font-medium">
                    <Calendar className="size-3.5 text-subtle" />
                    {t("filters.toDate")}
                  </Label>
                  <Input id="to-date" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} required />
                </div>

                {/* 5. To Time */}
                <div className="space-y-1.5">
                  <Label htmlFor="to-time" className="flex items-center gap-1.5 text-xs font-medium">
                    <Clock className="size-3.5 text-subtle" />
                    {t("filters.toTime")}
                  </Label>
                  <Input id="to-time" type="time" value={toTime} onChange={(e) => setToTime(e.target.value)} required />
                </div>
              </div>

              <div className="grid gap-3 border-t border-border pt-3">
                {/* 6. Select Route (Optional) */}
                <div className="space-y-1.5">
                  <Label htmlFor="route-select" className="flex items-center gap-1.5 text-xs font-medium">
                    <RouteIcon className="size-3.5 text-sand" />
                    {t("filters.route")}
                  </Label>
                  <Select id="route-select" value={selectedRouteId} onChange={handleRouteChange}>
                    <option value="">{t("filters.routePlaceholder")}</option>
                    {routes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                </div>

                {/* 7. Select Trip Event */}
                <div className="space-y-1.5">
                  <Label htmlFor="event-select" className="flex items-center gap-1.5 text-xs font-medium">
                    <AlertTriangle className="size-3.5 text-destructive" />
                    {t("filters.tripEvent")}
                  </Label>
                  <Select
                    id="event-select"
                    value={selectedEventTypeId}
                    onChange={(e) => setSelectedEventTypeId(e.target.value)}
                  >
                    <option value="all">{t("filters.allEvents")}</option>
                    {eventTypes.map((et) => (
                      <option key={et.id} value={et.id}>
                        {et.name} ({et.code})
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {/* Submit Track Button */}
              <div>
                <Button type="submit" disabled={isLoading || !selectedTarget} className="w-full">
                  {isLoading ? t("filters.loading") : t("filters.submit")}
                </Button>
              </div>

              {/* Planned Route Adherence notification */}
              {routeAdherence && (
                <div className="flex items-center justify-between rounded-ctl border border-sand/40 bg-sand-soft px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-sand" />
                    <span className="font-semibold text-foreground">{t("playback.adherence")}:</span>
                    <span className="text-muted-foreground">
                      {t("playback.waypointsReached", {
                        reached: routeAdherence.reached,
                        total: routeAdherence.total,
                      })}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-sand">{routeAdherence.percentage}%</span>
                </div>
              )}

              {errorMsg && (
                <Alert tone="error" className="mt-2">
                  {errorMsg}
                </Alert>
              )}
            </form>
          </div>
        )}
      </section>

      {/* Trip stats and panel switches: top end on large screens, above the playback bar on small ones */}
      <div className="absolute inset-x-3 bottom-[8.5rem] z-10 grid gap-2 sm:inset-x-4 lg:inset-x-auto lg:bottom-auto lg:end-4 lg:top-4 lg:justify-items-end">
        <dl className="glass-panel flex divide-x divide-border overflow-x-auto rounded-2xl rtl:divide-x-reverse">
          {statItems.map((item) => (
            <div key={item.key} className="min-w-[84px] px-3 py-2 text-center" title={"title" in item ? item.title : undefined}>
              <dt className="whitespace-nowrap text-[10px] font-medium text-muted-foreground">
                {t(`stats.${item.key}`)}
              </dt>
              <dd className={cn("font-mono text-base font-bold", item.tone)}>
                {item.value}
                {item.unit ? (
                  <span className="ms-1 text-[10px] font-normal text-muted-foreground">{item.unit}</span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>

        <div className="glass-panel flex flex-wrap items-center gap-1 rounded-xl p-1">
          <Button variant={activeTab === "legs" ? "secondary" : "ghost"} size="sm" onClick={() => toggleTab("legs")}>
            <RouteIcon className="size-3.5" />
            {t("playback.routesUsed", { count: routeLegs.length })}
          </Button>
          <Button
            variant={activeTab === "points" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => toggleTab("points")}
          >
            <ListFilter className="size-3.5" />
            GPS Points ({validPoints.length})
          </Button>
          <Button
            variant={activeTab === "events" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => toggleTab("events")}
          >
            <AlertTriangle className="size-3.5" />
            Trip Events ({filteredEvents.length})
          </Button>
          {roadSnapAvailable && (
            <Button
              variant={snapToRoads ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setSnapToRoads(!snapToRoads)}
              title={snapToRoads ? t("playback.snapToRoads") : t("playback.rawGps")}
            >
              <Layers className="size-3.5" />
              {snapToRoads ? t("playback.snapToRoads") : t("playback.rawGps")}
            </Button>
          )}
          {focusedLeg && (
            <span className="flex items-center gap-1.5 rounded-lg bg-primary-soft px-2 py-1 text-xs font-medium text-primary">
              {t("playback.leg", { n: focusedLeg.legNumber })}
              <button
                type="button"
                onClick={() => setFocusedLeg(null)}
                className="font-bold underline hover:opacity-80"
              >
                ✕ {t("playback.showFullRoute")}
              </button>
            </span>
          )}
        </div>
      </div>

      {/* Routes used, GPS points and trip events: a floating panel over the map */}
      {dataTab && (
        <section
          aria-labelledby="history-data-title"
          className={cn(
            "glass-panel absolute inset-x-3 top-3 bottom-[13rem] z-30 flex flex-col overflow-hidden rounded-2xl sm:inset-x-4 lg:inset-x-auto lg:end-4 lg:top-[8.25rem] lg:bottom-[8.5rem]",
            // Trip events have more columns: wider, but never over the parameters panel (380px + gaps).
            dataTab === "events" ? "lg:w-[min(760px,calc(100%-26rem))]" : "lg:w-[460px]",
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <h2 id="history-data-title" className="text-sm font-semibold">
              {dataTitle}
            </h2>
            <button
              type="button"
              onClick={() => setActiveTab("map")}
              aria-label={t("panel.close")}
              className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {dataTab === "legs" && (
              <div className="grid gap-3 p-4">
                {routeLegs.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    No route runs identified in this time window.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {routeLegs.map((leg) => (
                      <Card
                        key={leg.id}
                        className={cn(
                          "p-3.5 transition-colors hover:border-primary",
                          focusedLeg?.id === leg.id && "border-primary bg-primary-soft/30",
                        )}
                      >
                        <div className="flex items-center justify-between pb-2 border-b border-border">
                          <div className="flex items-center gap-1.5 font-semibold text-sm text-foreground">
                            <RouteIcon className="size-4 text-primary" />
                            {t("playback.leg", { n: leg.legNumber })}
                          </div>
                          <span className="font-mono text-xs font-bold text-primary">{leg.distanceKm} km</span>
                        </div>

                        <div className="grid gap-1 py-2.5 text-xs">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock className="size-3.5 text-subtle" />
                            <span>
                              <span dir="ltr">{formatInCompanyTz(leg.startTime, displayZone, "HH:mm")} → {formatInCompanyTz(leg.endTime, displayZone, "HH:mm")}</span> ({formatDuration(leg.durationMs)})
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <MapPin className="size-3.5 text-moving" />
                            <span className="truncate">
                              Start: {leg.startLat.toFixed(4)}, {leg.startLng.toFixed(4)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <MapPin className="size-3.5 text-destructive" />
                            <span className="truncate">
                              End: {leg.endLat.toFixed(4)}, {leg.endLng.toFixed(4)}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between font-mono text-[11px] text-subtle">
                            <span>Max: {leg.maxSpeed} km/h</span>
                            <span>Avg: {leg.avgSpeed} km/h</span>
                            <span>{leg.pointsCount} points</span>
                          </div>
                        </div>

                        <Button
                          variant={focusedLeg?.id === leg.id ? "primary" : "secondary"}
                          size="sm"
                          className="w-full text-xs"
                          onClick={() => {
                            setFocusedLeg(leg);
                            setActiveIndex(leg.startIndex);
                            setActiveTab("map");
                          }}
                        >
                          {t("playback.focusLeg")}
                        </Button>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
            {dataTab === "points" && (
              <div className="p-4">
                <table className="w-full border-collapse text-start text-xs">
                  <thead>
                    <tr className="border-b border-border bg-surface-2 text-subtle">
                      <th className="p-2 text-start">#</th>
                      <th className="p-2 text-start">Recorded Time</th>
                      <th className="p-2 text-start">Speed</th>
                      <th className="p-2 text-start">Latitude</th>
                      <th className="p-2 text-start">Longitude</th>
                      <th className="p-2 text-end">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validPoints.map((p, idx) => (
                      <tr
                        key={idx}
                        className={cn(
                          "cursor-pointer border-b border-border/50 hover:bg-surface-2",
                          idx === activeIndex && "bg-primary-soft font-semibold text-primary",
                        )}
                        onClick={() => {
                          setActiveIndex(idx);
                          setActiveTab("map");
                        }}
                      >
                        <td className="p-2 font-mono">{idx + 1}</td>
                        <td className="p-2 font-mono" dir="ltr">{formatInCompanyTz(p.recordedAt, displayZone)}</td>
                        <td className="p-2 font-mono">{p.speed ?? 0} km/h</td>
                        <td className="p-2 font-mono">{p.locationLat?.toFixed(6)}</td>
                        <td className="p-2 font-mono">{p.locationLng?.toFixed(6)}</td>
                        <td className="p-2 text-end">
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                            Seek
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {dataTab === "events" && (
              <div className="overflow-x-auto p-4">
                {filteredEvents.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">{t("events.noEvents")}</div>
                ) : (
                  <table className="w-full border-collapse text-start text-xs">
                    <thead>
                      <tr className="border-b border-border bg-surface-2 text-subtle">
                        <th className="p-2 text-start">{t("events.type")}</th>
                        <th className="p-2 text-start">{t("events.occurredAt")}</th>
                        <th className="p-2 text-start">{t("events.location")}</th>
                        <th className="p-2 text-end">
                          {t("events.speed")} · {t("events.voltage")}
                        </th>
                        <th className="p-2 text-start">{t("events.source")}</th>
                        <th className="p-2 text-end">
                          <span className="sr-only">{t("events.jumpTo")}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEvents.map((ev) => {
                        const isOn = ev.code === IGNITION_ON;
                        const isOff = ev.code === IGNITION_OFF;
                        return (
                          <tr key={ev.id} className="border-b border-border/50 hover:bg-surface-2">
                            <td className="p-2">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
                                  isOn
                                    ? "border-moving/25 bg-moving/10 text-moving"
                                    : isOff
                                      ? "border-border bg-surface-2 text-muted-foreground"
                                      : ev.code === "overspeed"
                                        ? "border-destructive/25 bg-destructive/10 text-destructive"
                                        : "border-sand/25 bg-sand-soft text-sand",
                                )}
                              >
                                <span className="size-1.5 rounded-full bg-current" aria-hidden />
                                {eventName(ev.code, ev.eventTypeId)}
                              </span>
                            </td>
                            <td className="p-2 font-mono whitespace-nowrap" dir="ltr">
                              {formatInCompanyTz(ev.occurredAt, displayZone, "dd-MM HH:mm:ss")}
                            </td>
                            <td className="p-2 font-mono whitespace-nowrap" dir="ltr">
                              {ev.lat != null && ev.lng != null ? `${ev.lat.toFixed(4)}, ${ev.lng.toFixed(4)}` : "—"}
                            </td>
                            <td className="p-2 text-end font-mono whitespace-nowrap">
                              {[
                                ev.speed != null ? `${Math.round(ev.speed)} ${t("stats.unitKmh")}` : null,
                                ev.externalVoltageMv != null ? `${(ev.externalVoltageMv / 1000).toFixed(1)} V` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ") || "—"}
                            </td>
                            <td className="p-2 whitespace-nowrap text-muted-foreground" title={ev.source === "track" ? t("events.fromTrackHint") : undefined}>
                              {ev.source === "api"
                                ? ev.resolvedAt
                                  ? t("events.resolved")
                                  : ev.acknowledgedAt
                                    ? t("events.acknowledged")
                                    : t("events.recorded")
                                : t("events.fromTrack")}
                            </td>
                            <td className="p-2 text-end">
                              <Button
                                variant="secondary"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => {
                                  const idx = nearestFixIndex(validPoints, ev.occurredAt);
                                  if (idx !== -1) setActiveIndex(idx);
                                  setActiveTab("map");
                                }}
                              >
                                {t("events.jumpTo")}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Playback: floating bar along the bottom. On large screens it starts after the parameters panel's
          column, leaving the corner for the map-type toggle even when the panel is collapsed. */}
      <div className="glass-panel absolute inset-x-3 bottom-3 z-10 rounded-2xl p-3 sm:inset-x-4 sm:bottom-4 lg:start-[calc(380px+2rem)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Control Buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={validPoints.length === 0}
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
              <span>{isPlaying ? t("playback.pause") : t("playback.play")}</span>
            </Button>

            <Button
              variant="secondary"
              size="icon"
              disabled={validPoints.length === 0 || activeIndex <= 0}
              onClick={() => setActiveIndex(Math.max(0, activeIndex - 1))}
            >
              <Rewind className="size-4" />
            </Button>

            <Button
              variant="secondary"
              size="icon"
              disabled={validPoints.length === 0 || activeIndex >= validPoints.length - 1}
              onClick={() => setActiveIndex(Math.min(validPoints.length - 1, activeIndex + 1))}
            >
              <FastForward className="size-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              disabled={validPoints.length === 0}
              onClick={() => {
                setIsPlaying(false);
                setActiveIndex(focusedLeg ? focusedLeg.startIndex : 0);
              }}
            >
              <RotateCcw className="size-4" />
            </Button>

            {/* Playback Speed Multiplier */}
            <div className="ms-2 flex items-center gap-1 rounded bg-surface p-0.5 text-xs">
              {[1, 2, 5, 10].map((spd) => (
                <button
                  key={spd}
                  type="button"
                  onClick={() => setPlaybackSpeed(spd)}
                  className={cn(
                    "rounded px-2 py-0.5 font-mono text-[11px] transition-colors",
                    playbackSpeed === spd
                      ? "bg-primary font-bold text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>

          {/* Live Position & Scrubber Meta */}
          <div className="flex items-center gap-4 text-xs">
            <label className="flex cursor-pointer items-center gap-1.5 text-muted-foreground">
              <input
                type="checkbox"
                checked={followVehicle}
                onChange={(e) => setFollowVehicle(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              <span>{t("playback.followVehicle")}</span>
            </label>

            {validPoints.length > 0 && (
              <span className="font-mono text-muted-foreground">
                {t("playback.point", { current: activeIndex + 1, total: validPoints.length })}
              </span>
            )}
          </div>
        </div>

        {/* Range Slider Scrubber */}
        <div className="mt-3">
          <input
            type="range"
            min={focusedLeg ? focusedLeg.startIndex : 0}
            max={focusedLeg ? focusedLeg.endIndex : Math.max(0, validPoints.length - 1)}
            value={activeIndex}
            disabled={validPoints.length === 0}
            onChange={(e) => setActiveIndex(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-surface-3 accent-primary"
          />
        </div>
        {activePoint && (
          <div className="mt-2 flex items-center justify-end gap-3 font-mono text-[11px] text-muted-foreground">
            <span dir="ltr">{t("playback.currentTime", { time: formatInCompanyTz(activePoint.recordedAt, displayZone) })}</span>
            <span className="font-semibold text-primary">
              {t("playback.currentSpeed", { speed: activePoint.speed ?? 0 })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
