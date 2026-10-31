"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Navigation, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PositionHistoryPoint, RoutePoint, AlertEventItem, EventTypeItem } from "@/lib/graphql/operations";
import {
  bearing,
  buildPlaybackTrack,
  fetchRoadPaths,
  positionAt,
  RoadPathDeniedError,
  splitIntoSegments,
  type Fix,
  type SegmentRoad,
  type PlaybackTrack,
} from "@/lib/history/road-path";

interface GoogleMapInstance {
  setCenter: (latLng: unknown) => void;
  panTo: (latLng: unknown) => void;
  fitBounds: (bounds: unknown) => void;
}

interface GoogleMarkerInstance {
  setMap: (map: unknown) => void;
  setPosition: (latLng: unknown) => void;
  setIcon: (icon: unknown) => void;
  addListener: (event: string, handler: () => void) => void;
}

interface GooglePolylineInstance {
  setMap: (map: unknown) => void;
  setOptions: (options: Record<string, unknown>) => void;
}

/** GPS rows → timed fixes. Klever timestamps are UTC, as "YYYY-MM-DD HH:mm:ss" or ISO. */
function toFixes(points: PositionHistoryPoint[]): Fix[] {
  return points.map((p) => {
    const iso = p.recordedAt.includes("T") ? p.recordedAt : `${p.recordedAt.replace(" ", "T")}Z`;
    const time = Date.parse(iso);
    return { lat: p.locationLat!, lng: p.locationLng!, ...(Number.isNaN(time) ? {} : { time }) };
  });
}

/** Playback arrow style; `path` and `rotation` are added where it's drawn. */
const VEHICLE_ICON = { scale: 6, fillColor: "#3BB8AE", fillOpacity: 1, strokeColor: "#102422", strokeWeight: 2 };

/** Base GPS track styles: faint under a snapped road path, prominent on its own. */
const TRACK_UNDER_SNAP = { strokeColor: "#566B68", strokeOpacity: 0.4, strokeWeight: 2 };
const TRACK_ALONE = { strokeColor: "#0B6E69", strokeOpacity: 0.9, strokeWeight: 5 };

/**
 * Set once Google refuses a Routes API request (the API isn't enabled for this key), so the
 * page stops calling it for the rest of the session instead of failing on every redraw.
 */
let roadSnapBlocked = false;

interface GoogleInfoWindowInstance {
  open: (map: unknown, marker: unknown) => void;
}

interface GoogleMapsGlobal {
  maps: {
    Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
    LatLng: new (lat: number, lng: number) => unknown;
    LatLngBounds: new () => { extend: (coord: unknown) => void };
    Polyline: new (options: Record<string, unknown>) => GooglePolylineInstance;
    Marker: new (options: Record<string, unknown>) => GoogleMarkerInstance;
    InfoWindow: new (options: Record<string, unknown>) => GoogleInfoWindowInstance;
    SymbolPath: {
      CIRCLE: unknown;
      FORWARD_CLOSED_ARROW: unknown;
      BACKWARD_CLOSED_ARROW: unknown;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleMapsGlobal;
    initGoogleMapsCallback?: () => void;
  }
}

export type MapProps = {
  points: PositionHistoryPoint[];
  activeIndex: number;
  onSelectPoint?: (index: number) => void;
  routePoints?: RoutePoint[];
  events?: AlertEventItem[];
  eventTypes?: EventTypeItem[];
  followVehicle?: boolean;
  snapToRoads?: boolean;
  /** Called when Google refuses road snapping, so the page can hide the option. */
  onRoadSnapUnavailable?: () => void;
  /** Time between playback steps; the marker glides to the next fix over this long. 0 = jump. */
  stepDurationMs?: number;
  focusedSegment?: { startIndex: number; endIndex: number } | null;
  /**
   * Fill the parent edge to edge with no card frame, for a full-screen page with floating panels.
   * Google's own fullscreen button is dropped and the remaining controls move out of the panels' way.
   */
  fullscreen?: boolean;
};

// Dark mode map styles matching the Klever Tracker dark palette
const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#121E1D" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#182826" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#98ACA9" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#3BB8AE" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#253836" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#182826" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#E2ECEA" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0C1514" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#566B68" }] },
];

export function GoogleMapView({
  points,
  activeIndex,
  onSelectPoint,
  routePoints = [],
  events = [],
  eventTypes = [],
  followVehicle = true,
  snapToRoads = false,
  onRoadSnapUnavailable,
  stepDurationMs = 0,
  focusedSegment = null,
  fullscreen = false,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const polylinesRef = useRef<GooglePolylineInstance[]>([]);
  const snappedRoadPolylinesRef = useRef<GooglePolylineInstance[]>([]);
  const routePolylineRef = useRef<GooglePolylineInstance | null>(null);
  const vehicleMarkerRef = useRef<GoogleMarkerInstance | null>(null);
  const markersRef = useRef<GoogleMarkerInstance[]>([]);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [mapsLoaded, setMapsLoaded] = useState(() => typeof window !== "undefined" && Boolean(window.google?.maps));
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filter out any invalid (0, 0) or null coordinates
  const validPoints = useMemo(() => {
    return points.filter(
      (p) =>
        p.locationLat != null &&
        p.locationLng != null &&
        p.locationLat !== 0 &&
        p.locationLng !== 0 &&
        !isNaN(p.locationLat) &&
        !isNaN(p.locationLng),
    );
  }, [points]);

  // Points within the currently focused route segment, if one is active. Keyed on the indices,
  // not the object: the parent passes a new object each render, which would otherwise redraw
  // the map (and re-request the road path) on every render.
  const segmentStart = focusedSegment?.startIndex ?? null;
  const segmentEnd = focusedSegment?.endIndex ?? null;
  const displayPoints = useMemo(() => {
    if (segmentStart === null || segmentEnd === null) return validPoints;
    return validPoints.slice(segmentStart, segmentEnd + 1);
  }, [validPoints, segmentStart, segmentEnd]);

  const activePoint = validPoints[activeIndex] || validPoints[0] || null;

  // GPS fixes placed on the road path, for the playback marker. Tied to the exact points it was
  // computed for, so a stale result is never used after the track changes.
  const [snappedTrack, setSnappedTrack] = useState<{
    points: PositionHistoryPoint[];
    roads: (SegmentRoad | null)[];
  } | null>(null);
  // Playback animation state: where the marker is along the track, which fix it last showed,
  // the running animation frame and the arrow's current direction.
  const markerAlongRef = useRef(0);
  const markerIndexRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastHeadingRef = useRef(0);

  // Load Google Maps script when apiKey is available
  useEffect(() => {
    if (!apiKey) return;
    if (typeof window !== "undefined" && window.google?.maps) return;

    const scriptId = "google-maps-api-script";
    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;

    if (!existingScript) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry`;
      script.async = true;
      script.defer = true;
      script.onload = () => setMapsLoaded(true);
      script.onerror = () => setLoadError("Failed to load Google Maps API script. Please check your API key.");
      document.head.appendChild(script);
    } else {
      existingScript.addEventListener("load", () => setMapsLoaded(true));
    }
  }, [apiKey]);

  // Initialize Map
  useEffect(() => {
    if (!mapsLoaded || !containerRef.current || !window.google?.maps) return;

    if (!mapRef.current) {
      const isDark = document.documentElement.classList.contains("dark");
      const defaultCenter =
        displayPoints.length > 0
          ? { lat: displayPoints[0].locationLat!, lng: displayPoints[0].locationLng! }
          : { lat: 25.2048, lng: 55.2708 }; // Dubai default

      mapRef.current = new window.google.maps.Map(containerRef.current, {
        zoom: 14,
        center: defaultCenter,
        mapTypeId: "roadmap",
        styles: isDark ? DARK_MAP_STYLE : [],
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: !fullscreen,
        zoomControl: true,
        ...(fullscreen ? floatingControlOptions() : {}),
      });
    }
  }, [mapsLoaded, displayPoints, fullscreen]);

  // Update Polylines, Markers, Bounds, and Snap to Exact Road Route
  useEffect(() => {
    if (!mapRef.current || !window.google?.maps) return;

    // Clean up previous markers & polylines
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    polylinesRef.current.forEach((line) => line.setMap(null));
    polylinesRef.current = [];
    snappedRoadPolylinesRef.current.forEach((line) => line.setMap(null));
    snappedRoadPolylinesRef.current = [];
    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
      routePolylineRef.current = null;
    }

    if (displayPoints.length === 0) return;

    const bounds = new window.google.maps.LatLngBounds();
    const pathCoords = displayPoints.map((p) => {
      const latLng = new window.google!.maps.LatLng(p.locationLat!, p.locationLng!);
      bounds.extend(latLng);
      return latLng;
    });

    // Draw planned route overlay if provided
    if (routePoints.length > 0) {
      const routeCoords = routePoints
        .filter((rp) => rp.locationLat != null && rp.locationLng != null)
        .map((rp) => {
          const pt = new window.google!.maps.LatLng(rp.locationLat!, rp.locationLng!);
          bounds.extend(pt);
          return pt;
        });

      if (routeCoords.length > 0) {
        routePolylineRef.current = new window.google.maps.Polyline({
          path: routeCoords,
          geodesic: true,
          strokeColor: "#A8782A", // Brand sand color
          strokeOpacity: 0.65,
          strokeWeight: 4,
          map: mapRef.current,
        });

        // Add waypoint markers
        routePoints.forEach((rp) => {
          if (rp.locationLat == null || rp.locationLng == null) return;
          const marker = new window.google!.maps.Marker({
            position: { lat: rp.locationLat, lng: rp.locationLng },
            map: mapRef.current,
            label: { text: String(rp.sequence), color: "#ffffff", fontWeight: "bold", fontSize: "11px" },
            title: rp.address || `Stop #${rp.sequence}`,
            icon: {
              path: window.google!.maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: "#A8782A",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            },
          });
          markersRef.current.push(marker);
        });
      }
    }

    const snapping = snapToRoads && !roadSnapBlocked && displayPoints.length >= 2;

    // Draw the GPS track, one line per segment: no line across a GPS glitch or data gap.
    const fixes = toFixes(displayPoints);
    const baseTracks = splitIntoSegments(fixes).map(
      (indices) =>
        new window.google!.maps.Polyline({
          path: indices.map((i) => pathCoords[i]),
          geodesic: true,
          ...(snapping ? TRACK_UNDER_SNAP : TRACK_ALONE),
          map: mapRef.current,
        }),
    );
    polylinesRef.current = baseTracks;
    const showGpsTrack = () => baseTracks.forEach((line) => line.setOptions(TRACK_ALONE));

    // Snap to real roads with Google's Routes API when enabled. Aborted when the effect re-runs,
    // so a slow response can't draw over a newer track.
    const controller = snapping && apiKey ? new AbortController() : null;
    if (controller && apiKey) {
      fetchRoadPaths(fixes, apiKey, controller.signal)
        .then((roads) => {
          if (controller.signal.aborted || !window.google?.maps) return;
          if (roads.every((road) => !road)) {
            // No road path: show the GPS track itself as the route.
            showGpsTrack();
            return;
          }
          roads.forEach((road, s) => {
            if (!road) return; // parked or unroutable: its GPS line stays as the route
            snappedRoadPolylinesRef.current.push(
              new window.google!.maps.Polyline({
                path: road.path,
                geodesic: true,
                strokeColor: "#0B6E69", // Vibrant primary teal for exact road path
                strokeOpacity: 0.95,
                strokeWeight: 5,
                map: mapRef.current,
              }),
            );
            // The road path replaces the raw GPS line (shown faintly only while the path loads).
            baseTracks[s].setMap(null);
          });
          baseTracks.forEach((line, s) => {
            if (!roads[s]) line.setOptions(TRACK_ALONE);
          });
          setSnappedTrack({ points: displayPoints, roads });
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          showGpsTrack();
          if (err instanceof RoadPathDeniedError) {
            roadSnapBlocked = true;
            onRoadSnapUnavailable?.();
          }
        });
    }

    // Start Marker (Green)
    const startPoint = displayPoints[0];
    const startMarker = new window.google.maps.Marker({
      position: { lat: startPoint.locationLat, lng: startPoint.locationLng },
      map: mapRef.current,
      title: `Start: ${startPoint.recordedAt}`,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: "#16A34A",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2,
      },
    });
    markersRef.current.push(startMarker);

    // End Marker (Red)
    if (displayPoints.length > 1) {
      const endPoint = displayPoints[displayPoints.length - 1];
      const endMarker = new window.google.maps.Marker({
        position: { lat: endPoint.locationLat, lng: endPoint.locationLng },
        map: mapRef.current,
        title: `End: ${endPoint.recordedAt}`,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#DC2626",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
      markersRef.current.push(endMarker);
    }

    // Event Markers along the track
    if (events.length > 0) {
      const eventTypeMap = new Map(eventTypes.map((et) => [et.id, et]));
      events.forEach((ev) => {
        const matchedPoint =
          displayPoints.find((p) => p.recordedAt.substring(0, 16) === ev.occurredAt.substring(0, 16)) ||
          displayPoints[0];

        if (!matchedPoint?.locationLat || !matchedPoint?.locationLng) return;

        const et = eventTypeMap.get(ev.eventTypeId);
        const eventName = et?.name || "Trip Event";
        const isOverspeed = et?.code === "overspeed";

        const evMarker = new window.google!.maps.Marker({
          position: { lat: matchedPoint.locationLat, lng: matchedPoint.locationLng },
          map: mapRef.current,
          title: `${eventName} @ ${ev.occurredAt}`,
          icon: {
            path: window.google!.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
            scale: 5,
            fillColor: isOverspeed ? "#DC2626" : "#D97706",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 1.5,
          },
        });

        const infoWindow = new window.google!.maps.InfoWindow({
          content: `<div style="font-family:sans-serif;font-size:12px;padding:4px">
            <strong>${eventName}</strong><br/>
            Time: ${ev.occurredAt}<br/>
            Speed: ${matchedPoint.speed ?? 0} km/h
          </div>`,
        });

        evMarker.addListener("click", () => {
          infoWindow.open(mapRef.current, evMarker);
        });

        markersRef.current.push(evMarker);
      });
    }

    // Vehicle Playback Marker (remove the previous one so redraws don't leave copies behind)
    vehicleMarkerRef.current?.setMap(null);
    vehicleMarkerRef.current = new window.google.maps.Marker({
      position: { lat: startPoint.locationLat, lng: startPoint.locationLng },
      map: mapRef.current,
      zIndex: 999,
      icon: { ...VEHICLE_ICON, path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW, rotation: 0 },
    });

    mapRef.current.fitBounds(bounds);
    return () => controller?.abort();
  }, [mapsLoaded, displayPoints, routePoints, events, eventTypes, snapToRoads, onRoadSnapUnavailable, apiKey]);

  // What the playback marker moves along: the road path when it's shown, else the GPS track.
  const markerTrack = useMemo<PlaybackTrack>(() => {
    const roads = snapToRoads && snappedTrack?.points === displayPoints ? snappedTrack.roads : null;
    return buildPlaybackTrack(toFixes(displayPoints), roads);
  }, [snapToRoads, snappedTrack, displayPoints]);

  // Move the vehicle marker to the active fix. One step forward (normal playback) glides along the
  // track over the step's duration, so the marker drives along the road; any other change (seek,
  // reset, new track) jumps straight there.
  useEffect(() => {
    const marker = vehicleMarkerRef.current;
    if (!activePoint || !marker || !window.google?.maps || markerTrack.along.length === 0) return;
    const maps = window.google.maps;

    // activeIndex counts from the start of the whole track; markerTrack from the focused segment.
    const i = Math.min(Math.max(activeIndex - (segmentStart ?? 0), 0), markerTrack.along.length - 1);
    const target = markerTrack.along[i];
    const from = markerAlongRef.current;
    const total = markerTrack.cumulative[markerTrack.cumulative.length - 1];

    const place = (distance: number) => {
      markerAlongRef.current = distance;
      const position = positionAt(markerTrack, distance);
      // Point the arrow along the track, a few metres ahead (or behind, at the very end).
      const ahead = positionAt(markerTrack, Math.min(distance + 8, total));
      const behind = positionAt(markerTrack, Math.max(distance - 8, 0));
      if (ahead.lat !== position.lat || ahead.lng !== position.lng) lastHeadingRef.current = bearing(position, ahead);
      else if (behind.lat !== position.lat || behind.lng !== position.lng)
        lastHeadingRef.current = bearing(behind, position);

      const latLng = new maps.LatLng(position.lat, position.lng);
      marker.setPosition(latLng);
      marker.setIcon({ ...VEHICLE_ICON, path: maps.SymbolPath.FORWARD_CLOSED_ARROW, rotation: lastHeadingRef.current });
      return latLng;
    };

    // Drive only for one step forward within a segment; across a GPS glitch or gap, jump.
    const steppedForward =
      markerIndexRef.current === i - 1 && target > from && markerTrack.segmentOf[i] === markerTrack.segmentOf[i - 1];
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    markerIndexRef.current = i;

    if (!steppedForward || reducedMotion || stepDurationMs <= 0) {
      const latLng = place(target);
      if (followVehicle) mapRef.current?.panTo(latLng);
      return;
    }

    // Leave a little of the step for the next one to start, so playback never stutters.
    const duration = stepDurationMs * 0.9;
    const start = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const latLng = place(from + (target - from) * t);
      if (followVehicle) mapRef.current?.setCenter(latLng);
      animationFrameRef.current = t < 1 ? requestAnimationFrame(frame) : null;
    };
    animationFrameRef.current = requestAnimationFrame(frame);

    return () => {
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    };
  }, [activePoint, activeIndex, segmentStart, markerTrack, followVehicle, stepDurationMs]);

  // Fallback interactive SVG canvas for route preview when no Google Maps key is configured
  if (!apiKey || loadError) {
    return (
      <div className={cn("relative flex w-full flex-col overflow-hidden bg-surface-2", fullscreen ? FULL : CARD)}>
        {/* Warning Banner */}
        <div className="flex items-center gap-2.5 border-b border-border bg-surface px-4 py-2.5 text-xs text-muted-foreground">
          <AlertCircle className="size-4 shrink-0 text-sand" />
          <div className="flex-1">
            <span className="font-semibold text-foreground">Google Maps API Key: </span>
            {loadError || (
              <>
                Add{" "}
                <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-primary">
                  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
                </code>{" "}
                to your <code className="font-mono">web/.env.local</code> file to enable Google Maps. An interactive
                route canvas preview is active below.
              </>
            )}
          </div>
        </div>

        {/* SVG Route Visualizer */}
        <div className="relative flex-1 overflow-hidden p-4">
          <SvgRouteCanvas
            points={displayPoints}
            activeIndex={activeIndex}
            routePoints={routePoints}
            onSelectPoint={onSelectPoint}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative w-full overflow-hidden bg-surface-2", fullscreen ? FULL : CARD)}>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

const CARD = "h-[500px] rounded-lg border border-border lg:h-[600px]";
const FULL = "h-full";

/**
 * Map type in the bottom corner under the parameters panel, zoom halfway down the opposite edge (clear of
 * the playback bar). Google positions are physical, so they swap for right-to-left pages.
 */
function floatingControlOptions(): Record<string, unknown> {
  const position = window.google?.maps.ControlPosition;
  if (!position) return {};
  const rtl = document.documentElement.dir === "rtl";
  return {
    mapTypeControlOptions: { position: rtl ? position.RIGHT_BOTTOM : position.LEFT_BOTTOM },
    zoomControlOptions: { position: rtl ? position.LEFT_CENTER : position.RIGHT_CENTER },
  };
}

/**
 * Interactive SVG Route Canvas used as an instant, zero-dependency visual preview
 * and fallback when the Google Maps API key is not yet set.
 */
function SvgRouteCanvas({
  points,
  activeIndex,
  routePoints = [],
  onSelectPoint,
}: {
  points: PositionHistoryPoint[];
  activeIndex: number;
  routePoints?: RoutePoint[];
  onSelectPoint?: (index: number) => void;
}) {
  const [hoveredPoint, setHoveredPoint] = useState<PositionHistoryPoint | null>(null);

  // Compute bounding box
  const bounds = useMemo(() => {
    if (points.length === 0) return null;
    let minLat = Infinity,
      maxLat = -Infinity,
      minLng = Infinity,
      maxLng = -Infinity;

    points.forEach((p) => {
      if (p.locationLat != null && p.locationLng != null) {
        minLat = Math.min(minLat, p.locationLat);
        maxLat = Math.max(maxLat, p.locationLat);
        minLng = Math.min(minLng, p.locationLng);
        maxLng = Math.max(maxLng, p.locationLng);
      }
    });

    const latSpan = maxLat - minLat || 0.01;
    const lngSpan = maxLng - minLng || 0.01;

    return {
      minLat: minLat - latSpan * 0.1,
      maxLat: maxLat + latSpan * 0.1,
      minLng: minLng - lngSpan * 0.1,
      maxLng: maxLng + lngSpan * 0.1,
    };
  }, [points]);

  const project = useCallback(
    (lat: number, lng: number) => {
      if (!bounds) return { x: 50, y: 50 };
      const width = 800;
      const height = 500;
      const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * (width - 80) + 40;
      // Invert Y because latitude increases northward
      const y = height - (((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * (height - 80) + 40);
      return { x, y };
    },
    [bounds],
  );

  if (points.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <Navigation className="size-8 text-subtle" />
        <p className="text-sm">No GPS position telemetry loaded yet.</p>
        <p className="text-xs text-subtle">Select a vehicle and time range to track route playback.</p>
      </div>
    );
  }

  const polylineD = points
    .map((p, i) => {
      const { x, y } = project(p.locationLat!, p.locationLng!);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const active = points[activeIndex] || points[0];
  const activeCoord = project(active.locationLat!, active.locationLng!);

  const startCoord = project(points[0].locationLat!, points[0].locationLng!);
  const endCoord = project(points[points.length - 1].locationLat!, points[points.length - 1].locationLng!);

  return (
    <div className="relative h-full w-full">
      <svg
        viewBox="0 0 800 500"
        className="h-full w-full cursor-crosshair rounded bg-surface"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="currentColor"
              className="text-border/40"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>

        {/* Map Grid Background */}
        <rect width="800" height="500" fill="url(#grid)" />

        {/* Planned Route Line */}
        {routePoints.length > 1 && (
          <path
            d={routePoints
              .filter((r) => r.locationLat != null && r.locationLng != null)
              .map((r, i) => {
                const { x, y } = project(r.locationLat!, r.locationLng!);
                return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
              })
              .join(" ")}
            fill="none"
            stroke="#A8782A"
            strokeWidth="3"
            strokeDasharray="6,4"
            opacity="0.6"
          />
        )}

        {/* Vehicle Telemetry Polyline */}
        <path d={polylineD} fill="none" stroke="#0B6E69" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />

        {/* Traveled History Segment */}
        {activeIndex > 0 && (
          <path
            d={points
              .slice(0, activeIndex + 1)
              .map((p, i) => {
                const { x, y } = project(p.locationLat!, p.locationLng!);
                return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
              })
              .join(" ")}
            fill="none"
            stroke="#3BB8AE"
            strokeWidth="5"
            strokeLinecap="round"
          />
        )}

        {/* Start Point */}
        <circle cx={startCoord.x} cy={startCoord.y} r="7" fill="#16A34A" stroke="#ffffff" strokeWidth="2" />
        <text x={startCoord.x + 10} y={startCoord.y + 4} fontSize="11" fontWeight="bold" fill="#16A34A">
          Start
        </text>

        {/* End Point */}
        <circle cx={endCoord.x} cy={endCoord.y} r="7" fill="#DC2626" stroke="#ffffff" strokeWidth="2" />
        <text x={endCoord.x + 10} y={endCoord.y + 4} fontSize="11" fontWeight="bold" fill="#DC2626">
          End
        </text>

        {/* Points click targets */}
        {points.map((p, i) => {
          const { x, y } = project(p.locationLat!, p.locationLng!);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={i === activeIndex ? "6" : "3"}
              className="cursor-pointer transition-transform hover:scale-150"
              fill={i === activeIndex ? "#3BB8AE" : "#0B6E69"}
              onClick={() => onSelectPoint?.(i)}
              onMouseEnter={() => setHoveredPoint(p)}
              onMouseLeave={() => setHoveredPoint(null)}
            />
          );
        })}

        {/* Current Vehicle Position Pin */}
        <g transform={`translate(${activeCoord.x}, ${activeCoord.y})`}>
          <circle r="12" fill="#3BB8AE" fillOpacity="0.3" className="animate-ping" />
          <circle r="8" fill="#3BB8AE" stroke="#102422" strokeWidth="2" />
          <circle r="3" fill="#ffffff" />
        </g>
      </svg>

      {/* Hover Info Tooltip */}
      {hoveredPoint && (
        <div className="pointer-events-none absolute bottom-4 left-4 rounded-md border border-border bg-surface/95 px-3 py-2 text-xs shadow-md backdrop-blur">
          <div className="font-semibold text-foreground">Time: {hoveredPoint.recordedAt}</div>
          <div className="text-muted-foreground">
            Speed: <span className="font-mono text-primary">{hoveredPoint.speed ?? 0} km/h</span>
          </div>
          <div className="font-mono text-[11px] text-subtle">
            {hoveredPoint.locationLat?.toFixed(5)}, {hoveredPoint.locationLng?.toFixed(5)}
          </div>
        </div>
      )}
    </div>
  );
}
