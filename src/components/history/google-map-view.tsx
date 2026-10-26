"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Navigation, AlertCircle } from "lucide-react";
import type { PositionHistoryPoint, RoutePoint, AlertEventItem, EventTypeItem } from "@/lib/graphql/operations";

interface GoogleMapInstance {
  setCenter: (latLng: unknown) => void;
  panTo: (latLng: unknown) => void;
  fitBounds: (bounds: unknown) => void;
}

interface GoogleMarkerInstance {
  setMap: (map: unknown) => void;
  setPosition: (latLng: unknown) => void;
  addListener: (event: string, handler: () => void) => void;
}

interface GooglePolylineInstance {
  setMap: (map: unknown) => void;
}

interface GoogleInfoWindowInstance {
  open: (map: unknown, marker: unknown) => void;
}

interface GoogleDirectionsResult {
  routes: Array<{
    overview_path: Array<{ lat: () => number; lng: () => number }>;
  }>;
}

interface GoogleDirectionsService {
  route: (
    request: {
      origin: unknown;
      destination: unknown;
      waypoints?: Array<{ location: unknown; stopover: boolean }>;
      travelMode: unknown;
    },
    callback: (result: GoogleDirectionsResult | null, status: string) => void,
  ) => void;
}

interface GoogleMapsGlobal {
  maps: {
    Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
    LatLng: new (lat: number, lng: number) => unknown;
    LatLngBounds: new () => { extend: (coord: unknown) => void };
    Polyline: new (options: Record<string, unknown>) => GooglePolylineInstance;
    Marker: new (options: Record<string, unknown>) => GoogleMarkerInstance;
    InfoWindow: new (options: Record<string, unknown>) => GoogleInfoWindowInstance;
    DirectionsService: new () => GoogleDirectionsService;
    TravelMode: {
      DRIVING: unknown;
    };
    DirectionsStatus: {
      OK: string;
    };
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
  focusedSegment?: { startIndex: number; endIndex: number } | null;
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
  snapToRoads = true,
  focusedSegment = null,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const polylineRef = useRef<GooglePolylineInstance | null>(null);
  const snappedRoadPolylineRef = useRef<GooglePolylineInstance | null>(null);
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

  // Points within the currently focused route segment, if one is active
  const displayPoints = useMemo(() => {
    if (!focusedSegment) return validPoints;
    return validPoints.slice(focusedSegment.startIndex, focusedSegment.endIndex + 1);
  }, [validPoints, focusedSegment]);

  const activePoint = validPoints[activeIndex] || validPoints[0] || null;

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
        fullscreenControl: true,
        zoomControl: true,
      });
    }
  }, [mapsLoaded, displayPoints]);

  // Update Polylines, Markers, Bounds, and Snap to Exact Road Route
  useEffect(() => {
    if (!mapRef.current || !window.google?.maps) return;

    // Clean up previous markers & polylines
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }
    if (snappedRoadPolylineRef.current) {
      snappedRoadPolylineRef.current.setMap(null);
      snappedRoadPolylineRef.current = null;
    }
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

    // Draw Telemetry Polyline (Base GPS Track)
    polylineRef.current = new window.google.maps.Polyline({
      path: pathCoords,
      geodesic: true,
      strokeColor: snapToRoads ? "#566B68" : "#0B6E69",
      strokeOpacity: snapToRoads ? 0.4 : 0.9,
      strokeWeight: snapToRoads ? 2 : 5,
      map: mapRef.current,
    });

    // Snap to exact roads using Google DirectionsService when enabled
    if (snapToRoads && displayPoints.length >= 2 && window.google.maps.DirectionsService) {
      const directionsService = new window.google.maps.DirectionsService();
      const origin = { lat: displayPoints[0].locationLat!, lng: displayPoints[0].locationLng! };
      const destination = {
        lat: displayPoints[displayPoints.length - 1].locationLat!,
        lng: displayPoints[displayPoints.length - 1].locationLng!,
      };

      // Sample intermediate points (Google Directions allows up to 23 waypoints)
      const maxWaypoints = Math.min(20, displayPoints.length - 2);
      const waypoints: Array<{ location: unknown; stopover: boolean }> = [];

      if (maxWaypoints > 0) {
        const step = (displayPoints.length - 1) / (maxWaypoints + 1);
        for (let i = 1; i <= maxWaypoints; i++) {
          const pt = displayPoints[Math.round(i * step)];
          if (pt?.locationLat && pt?.locationLng) {
            waypoints.push({
              location: new window.google.maps.LatLng(pt.locationLat, pt.locationLng),
              stopover: false,
            });
          }
        }
      }

      directionsService.route(
        {
          origin,
          destination,
          waypoints,
          travelMode: window.google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === window.google!.maps.DirectionsStatus.OK && result?.routes?.[0]?.overview_path) {
            const snappedCoords = result.routes[0].overview_path.map(
              (p) => new window.google!.maps.LatLng(p.lat(), p.lng()),
            );

            snappedRoadPolylineRef.current = new window.google!.maps.Polyline({
              path: snappedCoords,
              geodesic: true,
              strokeColor: "#0B6E69", // Vibrant primary teal for exact road path
              strokeOpacity: 0.95,
              strokeWeight: 5,
              map: mapRef.current,
            });
          }
        },
      );
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

    // Vehicle Playback Marker
    vehicleMarkerRef.current = new window.google.maps.Marker({
      position: { lat: startPoint.locationLat, lng: startPoint.locationLng },
      map: mapRef.current,
      zIndex: 999,
      icon: {
        path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: 6,
        fillColor: "#3BB8AE",
        fillOpacity: 1,
        strokeColor: "#102422",
        strokeWeight: 2,
        rotation: 0,
      },
    });

    mapRef.current.fitBounds(bounds);
  }, [mapsLoaded, displayPoints, routePoints, events, eventTypes, snapToRoads]);

  // Update vehicle position when activeIndex changes
  useEffect(() => {
    if (!activePoint || !vehicleMarkerRef.current || !window.google?.maps) return;

    const newPos = new window.google.maps.LatLng(activePoint.locationLat!, activePoint.locationLng!);
    vehicleMarkerRef.current.setPosition(newPos);

    if (followVehicle && mapRef.current) {
      mapRef.current.panTo(newPos);
    }
  }, [activePoint, followVehicle]);

  // Fallback interactive SVG canvas for route preview when no Google Maps key is configured
  if (!apiKey || loadError) {
    return (
      <div className="relative flex h-[500px] w-full flex-col overflow-hidden rounded-lg border border-border bg-surface-2 lg:h-[600px]">
        {/* Warning Banner */}
        <div className="flex items-center gap-2.5 border-b border-border bg-surface px-4 py-2.5 text-xs text-muted-foreground">
          <AlertCircle className="size-4 shrink-0 text-sand" />
          <div className="flex-1">
            <span className="font-semibold text-foreground">Google Maps API Key: </span>
            {loadError || (
              <>
                Add <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-primary">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to your <code className="font-mono">web/.env.local</code> file to enable Google Maps. An interactive route canvas preview is active below.
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
    <div className="relative h-[500px] w-full overflow-hidden rounded-lg border border-border bg-surface-2 lg:h-[600px]">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
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
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" className="text-border/40" strokeWidth="0.5" />
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
