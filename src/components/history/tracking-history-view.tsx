"use client";

import { useState, useEffect, useMemo, useCallback, type ChangeEvent } from "react";
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
  Compass,
  ListFilter,
  Layers,
  MapPin,
  CheckCircle2,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { GoogleMapView } from "@/components/history/google-map-view";
import { ApiRequestError, gqlRequest } from "@/lib/graphql/client";
import {
  GET_VEHICLES,
  GET_DEVICES,
  GET_ROUTES,
  GET_ROUTE_DETAIL,
  GET_EVENT_TYPES,
  GET_ALERT_EVENTS,
  GET_POSITION_HISTORY,
  type VehiclesResult,
  type DevicesResult,
  type RouteItem,
  type RoutesResult,
  type RouteDetailResult,
  type RoutePoint,
  type EventTypeItem,
  type EventTypesResult,
  type AlertEventItem,
  type AlertEventsResult,
  type PositionHistoryPoint,
  type PositionHistoryResult,
} from "@/lib/graphql/operations";
import {
  buildTrackTargets,
  companyDate,
  companyTimeToUtcIso,
  historyFilter,
  type TrackTarget,
} from "@/lib/history/selection";
import { cn } from "@/lib/utils";

/** Default window: the last 7 days in the company time zone. */
const DEFAULT_RANGE_DAYS = 6;

/**
 * Road snapping calls Google's Routes API, which must be enabled for the Maps key separately.
 * Off unless NEXT_PUBLIC_GOOGLE_ROUTES_ENABLED=true, so a key without it isn't called at all.
 */
const ROAD_SNAP_CONFIGURED = process.env.NEXT_PUBLIC_GOOGLE_ROUTES_ENABLED === "true";

export type RouteLeg = {
  id: string;
  legNumber: number;
  startIndex: number;
  endIndex: number;
  startTime: string;
  endTime: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  distanceKm: number;
  durationMins: number;
  maxSpeed: number;
  avgSpeed: number;
  pointsCount: number;
};

// Haversine calculation for route distance
function calculateDistance(points: Array<{ locationLat?: number | null; locationLng?: number | null }>): number {
  let dist = 0;
  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    if (
      p1?.locationLat &&
      p1?.locationLng &&
      p2?.locationLat &&
      p2?.locationLng &&
      p1.locationLat !== 0 &&
      p2.locationLat !== 0
    ) {
      const R = 6371;
      const dLat = (p2.locationLat - p1.locationLat) * (Math.PI / 180);
      const dLon = (p2.locationLng - p1.locationLng) * (Math.PI / 180);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(p1.locationLat * (Math.PI / 180)) *
          Math.cos(p2.locationLat * (Math.PI / 180)) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      dist += R * c;
    }
  }
  return dist;
}

// Compute individual route legs based on vehicle stops
function computeRouteLegs(points: PositionHistoryPoint[]): RouteLeg[] {
  if (points.length < 2) return [];

  const legs: RouteLeg[] = [];
  let currentStart = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];

    const prevTime = new Date(prev.recordedAt).getTime();
    const currTime = new Date(curr.recordedAt).getTime();
    const timeDiffMins = (currTime - prevTime) / (1000 * 60);

    // Split if there is a stop of >= 5 minutes with low/zero speed or large time gap
    const isStopSplit = timeDiffMins >= 5 && (prev.speed === 0 || curr.speed === 0);

    if (isStopSplit && i - currentStart >= 2) {
      const legPoints = points.slice(currentStart, i);
      const legDist = calculateDistance(legPoints);
      let legMax = 0;
      let legSum = 0;
      let legCount = 0;

      legPoints.forEach((p) => {
        const sp = p.speed ?? 0;
        if (sp > legMax) legMax = sp;
        if (sp > 0) {
          legSum += sp;
          legCount++;
        }
      });

      legs.push({
        id: `leg-${legs.length + 1}`,
        legNumber: legs.length + 1,
        startIndex: currentStart,
        endIndex: i - 1,
        startTime: points[currentStart].recordedAt,
        endTime: points[i - 1].recordedAt,
        startLat: points[currentStart].locationLat!,
        startLng: points[currentStart].locationLng!,
        endLat: points[i - 1].locationLat!,
        endLng: points[i - 1].locationLng!,
        distanceKm: Number(legDist.toFixed(1)),
        durationMins: Math.round(
          (new Date(points[i - 1].recordedAt).getTime() - new Date(points[currentStart].recordedAt).getTime()) /
            (1000 * 60),
        ),
        maxSpeed: Math.round(legMax),
        avgSpeed: legCount > 0 ? Math.round(legSum / legCount) : 0,
        pointsCount: legPoints.length,
      });

      currentStart = i;
    }
  }

  // Final leg
  if (points.length - currentStart >= 2) {
    const legPoints = points.slice(currentStart, points.length);
    const legDist = calculateDistance(legPoints);
    let legMax = 0;
    let legSum = 0;
    let legCount = 0;

    legPoints.forEach((p) => {
      const sp = p.speed ?? 0;
      if (sp > legMax) legMax = sp;
      if (sp > 0) {
        legSum += sp;
        legCount++;
      }
    });

    legs.push({
      id: `leg-${legs.length + 1}`,
      legNumber: legs.length + 1,
      startIndex: currentStart,
      endIndex: points.length - 1,
      startTime: points[currentStart].recordedAt,
      endTime: points[points.length - 1].recordedAt,
      startLat: points[currentStart].locationLat!,
      startLng: points[currentStart].locationLng!,
      endLat: points[points.length - 1].locationLat!,
      endLng: points[points.length - 1].locationLng!,
      distanceKm: Number(legDist.toFixed(1)),
      durationMins: Math.round(
        (new Date(points[points.length - 1].recordedAt).getTime() -
          new Date(points[currentStart].recordedAt).getTime()) /
          (1000 * 60),
      ),
      maxSpeed: Math.round(legMax),
      avgSpeed: legCount > 0 ? Math.round(legSum / legCount) : 0,
      pointsCount: legPoints.length,
    });
  }

  return legs;
}

export function TrackingHistoryView() {
  const t = useTranslations("history");
  const te = useTranslations("errors");

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
  const selectedTarget = targets.find((x) => x.key === selectedKey) ?? null;
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [routeDetail, setRouteDetail] = useState<RoutePoint[]>([]);
  const [eventTypes, setEventTypes] = useState<EventTypeItem[]>([]);
  const [allAlertEvents, setAllAlertEvents] = useState<AlertEventItem[]>([]);

  // Telemetry Position History
  const [positions, setPositions] = useState<PositionHistoryPoint[]>([]);
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

  // Fetches position history for a vehicle or device and window (up to 1000 points)
  const fetchHistory = useCallback(
    async (target: TrackTarget | null, fDate: string, fTime: string, tDate: string, tTime: string) => {
      if (!target) return;
      setIsLoading(true);
      setErrorMsg(null);
      setIsPlaying(false);
      setActiveIndex(0);
      setFocusedLeg(null);

      try {
        const res = await gqlRequest<PositionHistoryResult>(GET_POSITION_HISTORY, {
          ...historyFilter(target),
          from: companyTimeToUtcIso(fDate, fTime),
          to: companyTimeToUtcIso(tDate, tTime, 59),
          first: 1000,
        });

        const rawData = res?.positionHistory?.data || [];
        const sorted = [...rawData].sort(
          (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
        );

        setPositions(sorted);
        if (sorted.length === 0) {
          setErrorMsg(t("map.noPoints"));
        }
      } catch (err: unknown) {
        setPositions([]);
        setErrorMsg(te(err instanceof ApiRequestError ? err.error.kind : "unknown"));
      } finally {
        setIsLoading(false);
      }
    },
    [t, te],
  );

  // Fetch Initial Lookup Data on component mount
  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      try {
        const [vehiclesRes, devicesRes, routesRes, eventTypesRes, alertEventsRes] = await Promise.allSettled([
          gqlRequest<VehiclesResult>(GET_VEHICLES, { first: 100 }),
          gqlRequest<DevicesResult>(GET_DEVICES, { first: 100 }),
          gqlRequest<RoutesResult>(GET_ROUTES),
          gqlRequest<EventTypesResult>(GET_EVENT_TYPES),
          gqlRequest<AlertEventsResult>(GET_ALERT_EVENTS),
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
        setSelectedKey(defaultTarget?.key ?? "");

        if (routesRes.status === "fulfilled" && routesRes.value?.routes?.data) {
          setRoutes(routesRes.value.routes.data);
        }

        if (eventTypesRes.status === "fulfilled" && eventTypesRes.value?.eventTypes?.data) {
          setEventTypes(eventTypesRes.value.eventTypes.data);
        }

        if (alertEventsRes.status === "fulfilled" && alertEventsRes.value?.alertEvents?.data) {
          setAllAlertEvents(alertEventsRes.value.alertEvents.data);
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

  // Filtered Alert Events for current vehicle and selected event type
  const filteredEvents = useMemo(() => {
    return allAlertEvents.filter((ev) => {
      // Alert events carry a vehicle id; a device matches through the vehicle it's installed in.
      const matchesVehicle = !!selectedTarget?.vehicleId && ev.vehicleId === selectedTarget.vehicleId;
      const matchesType = selectedEventTypeId === "all" || ev.eventTypeId === selectedEventTypeId;
      return matchesVehicle && matchesType;
    });
  }, [allAlertEvents, selectedTarget, selectedEventTypeId]);

  // Filtered valid points (non-zero lat/lng)
  const validPoints = useMemo(() => {
    return positions.filter(
      (p) =>
        p.locationLat != null &&
        p.locationLng != null &&
        p.locationLat !== 0 &&
        p.locationLng !== 0 &&
        !isNaN(p.locationLat) &&
        !isNaN(p.locationLng),
    );
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
      return { totalDistance: 0, maxSpeed: 0, avgSpeed: 0, duration: "0m", pointsCount: 0 };
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

    const firstTime = new Date(currentScopePoints[0].recordedAt).getTime();
    const lastTime = new Date(currentScopePoints[currentScopePoints.length - 1].recordedAt).getTime();
    const diffMs = Math.max(0, lastTime - firstTime);
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    const duration = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    return {
      totalDistance: Number(totalDistance.toFixed(1)),
      maxSpeed: Math.round(maxSpeed),
      avgSpeed,
      duration,
      pointsCount: currentScopePoints.length,
    };
  }, [validPoints, focusedLeg]);

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

  return (
    <div className="grid gap-5">
      {/* Page Title & Intro */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-2 sm:pt-0" role="group" aria-label={t("filters.quickRanges")}>
          {(["today", "yesterday", "last7Days"] as const).map((preset) => (
            <Button
              key={preset}
              variant="ghost"
              size="sm"
              disabled={!selectedTarget || isLoading}
              onClick={() => setPresetRange(preset)}
            >
              {t(`filters.${preset}`)}
            </Button>
          ))}
        </div>
      </div>

      {hasTargets === false && (
        <Alert tone="warning">
          <strong className="font-semibold">{t("filters.noTargetsTitle")}</strong> {t("filters.noTargetsBody")}
        </Alert>
      )}

      {/* Filter Parameters Form Card */}
      <Card className="border-border-strong bg-surface">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">{t("filters.title")}</CardTitle>
        </CardHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void fetchHistory(selectedTarget, fromDate, fromTime, toDate, toTime);
          }}
          className="grid gap-4 px-6 pb-6"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            {/* 1. Vehicle / Device Dropdown */}
            <div className="space-y-1.5 xl:col-span-2">
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
                  <option value="">{hasTargets === null ? t("filters.loadingTargets") : t("filters.noTargetsTitle")}</option>
                )}
                {(["vehicle", "device"] as const).map((kind) => {
                  const group = targets.filter((x) => x.kind === kind);
                  if (group.length === 0) return null;
                  return (
                    <optgroup key={kind} label={t(kind === "vehicle" ? "filters.vehiclesGroup" : "filters.devicesGroup")}>
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
              <Input
                id="to-date"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                required
              />
            </div>

            {/* 5. To Time */}
            <div className="space-y-1.5">
              <Label htmlFor="to-time" className="flex items-center gap-1.5 text-xs font-medium">
                <Clock className="size-3.5 text-subtle" />
                {t("filters.toTime")}
              </Label>
              <Input
                id="to-time"
                type="time"
                value={toTime}
                onChange={(e) => setToTime(e.target.value)}
                required
              />
            </div>

            {/* Submit Track Button */}
            <div className="flex items-end">
              <Button type="submit" disabled={isLoading || !selectedTarget} className="w-full">
                {isLoading ? t("filters.loading") : t("filters.submit")}
              </Button>
            </div>
          </div>

          {/* Row 2: Optional Filters (Route & Trip Event) */}
          <div className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-3">
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
      </Card>

      {/* Trip Summary Telemetry KPI Tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card className="p-3.5 text-center">
          <div className="text-[11px] font-medium text-muted-foreground">{t("stats.totalDistance")}</div>
          <div className="mt-1 font-mono text-xl font-bold text-primary">
            {stats.totalDistance} <span className="text-xs font-normal text-muted-foreground">{t("stats.unitKm")}</span>
          </div>
        </Card>

        <Card className="p-3.5 text-center">
          <div className="text-[11px] font-medium text-muted-foreground">{t("stats.duration")}</div>
          <div className="mt-1 font-mono text-xl font-bold text-foreground">{stats.duration}</div>
        </Card>

        <Card className="p-3.5 text-center">
          <div className="text-[11px] font-medium text-muted-foreground">{t("stats.maxSpeed")}</div>
          <div className="mt-1 font-mono text-xl font-bold text-destructive">
            {stats.maxSpeed} <span className="text-xs font-normal text-muted-foreground">{t("stats.unitKmh")}</span>
          </div>
        </Card>

        <Card className="p-3.5 text-center">
          <div className="text-[11px] font-medium text-muted-foreground">{t("stats.avgSpeed")}</div>
          <div className="mt-1 font-mono text-xl font-bold text-moving">
            {stats.avgSpeed} <span className="text-xs font-normal text-muted-foreground">{t("stats.unitKmh")}</span>
          </div>
        </Card>

        <Card className="p-3.5 text-center">
          <div className="text-[11px] font-medium text-muted-foreground">{t("stats.pointsCount")}</div>
          <div className="mt-1 font-mono text-xl font-bold text-foreground">{stats.pointsCount}</div>
        </Card>

        <Card className="p-3.5 text-center">
          <div className="text-[11px] font-medium text-muted-foreground">{t("stats.eventsCount")}</div>
          <div className="mt-1 font-mono text-xl font-bold text-sand">{filteredEvents.length}</div>
        </Card>
      </div>

      {/* Main Map and Playback Section */}
      <Card className="overflow-hidden border-border bg-surface p-0 shadow-sm">
        {/* Navigation tabs: Map View / Exact Routes Used / Point Table / Event Log */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2 px-4 py-2">
          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant={activeTab === "map" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("map")}
            >
              <Compass className="size-3.5" />
              Map View
            </Button>
            <Button
              variant={activeTab === "legs" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("legs")}
            >
              <RouteIcon className="size-3.5" />
              {t("playback.routesUsed", { count: routeLegs.length })}
            </Button>
            <Button
              variant={activeTab === "points" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("points")}
            >
              <ListFilter className="size-3.5" />
              GPS Points ({validPoints.length})
            </Button>
            <Button
              variant={activeTab === "events" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("events")}
            >
              <AlertTriangle className="size-3.5" />
              Trip Events ({filteredEvents.length})
            </Button>
          </div>

          {/* Quick Route Snapping & Focused Leg Badges */}
          <div className="flex items-center gap-2">
            {focusedLeg && (
              <div className="flex items-center gap-1.5 rounded bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">
                <span>{t("playback.leg", { n: focusedLeg.legNumber })}</span>
                <button
                  type="button"
                  onClick={() => setFocusedLeg(null)}
                  className="font-bold underline hover:opacity-80"
                >
                  ✕ {t("playback.showFullRoute")}
                </button>
              </div>
            )}

            {roadSnapAvailable && (
              <Button
                variant={snapToRoads ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSnapToRoads(!snapToRoads)}
                title={snapToRoads ? t("playback.snapToRoads") : t("playback.rawGps")}
              >
                <Layers className="size-3.5" />
                {snapToRoads ? t("playback.snapToRoads") : t("playback.rawGps")}
              </Button>
            )}

            {activePoint && (
              <div className="hidden items-center gap-3 font-mono text-xs text-muted-foreground xl:flex">
                <span>{t("playback.currentTime", { time: activePoint.recordedAt })}</span>
                <span className="font-semibold text-primary">
                  {t("playback.currentSpeed", { speed: activePoint.speed ?? 0 })}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Tab 1: Interactive Map View */}
        {activeTab === "map" && (
          <div className="p-4">
            <GoogleMapView
              points={validPoints}
              activeIndex={activeIndex}
              onSelectPoint={setActiveIndex}
              routePoints={routeDetail}
              events={filteredEvents}
              eventTypes={eventTypes}
              followVehicle={followVehicle}
              snapToRoads={snapToRoads}
              onRoadSnapUnavailable={handleRoadSnapUnavailable}
              stepDurationMs={stepDurationMs}
              focusedSegment={
                focusedLeg ? { startIndex: focusedLeg.startIndex, endIndex: focusedLeg.endIndex } : null
              }
            />

            {/* Playback Controls Scrubber Bar */}
            <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
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
            </div>
          </div>
        )}

        {/* Tab 2: Exact Routes Used (Trips List) */}
        {activeTab === "legs" && (
          <div className="grid gap-3 p-4">
            {routeLegs.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No route runs identified in this time window.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                          {leg.startTime.substring(11, 16)} → {leg.endTime.substring(11, 16)} ({leg.durationMins}m)
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

        {/* Tab 3: Points Table */}
        {activeTab === "points" && (
          <div className="max-h-[500px] overflow-auto p-4">
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
                    <td className="p-2 font-mono">{p.recordedAt}</td>
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

        {/* Tab 4: Trip Events Table */}
        {activeTab === "events" && (
          <div className="max-h-[500px] overflow-auto p-4">
            {filteredEvents.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {t("events.noEvents")}
              </div>
            ) : (
              <table className="w-full border-collapse text-start text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface-2 text-subtle">
                    <th className="p-2 text-start">Event ID</th>
                    <th className="p-2 text-start">Event Type</th>
                    <th className="p-2 text-start">Occurred At</th>
                    <th className="p-2 text-start">Status</th>
                    <th className="p-2 text-end">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.map((ev) => {
                    const et = eventTypes.find((e) => e.id === ev.eventTypeId);
                    return (
                      <tr key={ev.id} className="border-b border-border/50 hover:bg-surface-2">
                        <td className="p-2 font-mono">{ev.id}</td>
                        <td className="p-2 font-medium text-foreground">
                          {et?.name || `Type ${ev.eventTypeId}`} ({et?.code || "event"})
                        </td>
                        <td className="p-2 font-mono">{ev.occurredAt}</td>
                        <td className="p-2">
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                              ev.resolvedAt
                                ? "bg-moving/10 text-moving"
                                : ev.acknowledgedAt
                                  ? "bg-sand/15 text-sand"
                                  : "bg-destructive/15 text-destructive",
                            )}
                          >
                            {ev.resolvedAt ? "Resolved" : ev.acknowledgedAt ? "Acknowledged" : "Active"}
                          </span>
                        </td>
                        <td className="p-2 text-end">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => {
                              const matchedIdx = validPoints.findIndex((p) =>
                                p.recordedAt.startsWith(ev.occurredAt.substring(0, 16)),
                              );
                              if (matchedIdx !== -1) {
                                setActiveIndex(matchedIdx);
                              }
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
      </Card>
    </div>
  );
}
