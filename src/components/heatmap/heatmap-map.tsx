"use client";

import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import { AdvancedMarker, APIProvider, InfoWindow, Map, useMap, type MapCameraChangedEvent } from "@vis.gl/react-google-maps";
import { Bike, CarFront, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Bbox, HeatmapCell } from "@/lib/heatmap/aggregate";
import { formatInCompanyTz, useCompanyTimeZone } from "@/lib/company-time";
import { DUBAI_CENTER, type Rgb } from "@/lib/heatmap/client";
import { cn } from "@/lib/utils";

export type HeatmapStyle = { visible: boolean; colorRange: Rgb[]; opacity: number; radius: number };

export type VehicleMapMarker = {
  id: string;
  label: string;
  kind: "truck" | "van" | "bike" | "car";
  position: { lat: number; lng: number };
  speed?: number;
  recordedAt?: string;
  totalPoints?: number;
};

type Props = {
  apiKey: string;
  cells: HeatmapCell[];
  bounds: Bbox | null;
  /** Changes once per "Show"; the map fits to `bounds` when it changes, not on zoom refetches. */
  fitKey: number;
  style: HeatmapStyle;
  onZoomChange: (zoom: number) => void;
  markers?: VehicleMapMarker[];
};

/** Google base map with a deck.gl HeatmapLayer and vehicle position markers. */
export default function HeatmapMap({ apiKey, cells, bounds, fitKey, style, onZoomChange, markers }: Props) {
  const t = useTranslations("heatmap");
  const zone = useCompanyTimeZone();
  const [activeMarker, setActiveMarker] = useState<VehicleMapMarker | null>(null);

  return (
    <APIProvider apiKey={apiKey}>
      <Map
        className="size-full"
        mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID"}
        defaultCenter={DUBAI_CENTER}
        defaultZoom={11}
        gestureHandling="greedy"
        streetViewControl={false}
        mapTypeControl={false}
        fullscreenControl={false}
        zoomControl={true}
        onCameraChanged={(e: MapCameraChangedEvent) => onZoomChange(e.detail.zoom)}
      >
        <DeckHeatmap cells={cells} style={style} />
        <FitBounds bounds={bounds} fitKey={fitKey} />
        {markers?.map((m) => (
          <AdvancedMarker
            key={m.id}
            position={m.position}
            title={m.label}
            onClick={() => setActiveMarker(m)}
          >
            <div
              className={cn(
                "grid size-9 place-items-center rounded-full text-white ring-2 ring-white shadow-lg transition-transform hover:scale-110 cursor-pointer",
                m.kind === "bike"
                  ? "bg-[#f4511e]"
                  : m.kind === "truck"
                    ? "bg-[#00897b]"
                    : "bg-[#1e88e5]",
              )}
            >
              {m.kind === "bike" ? (
                <Bike className="size-4.5" />
              ) : m.kind === "truck" ? (
                <Truck className="size-4.5" />
              ) : (
                <CarFront className="size-4.5" />
              )}
            </div>
          </AdvancedMarker>
        ))}

        {activeMarker && (
          <InfoWindow
            position={activeMarker.position}
            onCloseClick={() => setActiveMarker(null)}
          >
            <div className="p-1 min-w-[200px] text-xs text-foreground font-sans">
              <div className="font-bold text-sm text-[#0f4c47] mb-1">{activeMarker.label}</div>
              <dl className="space-y-0.5 text-muted-foreground text-[11px]">
                <div>
                  <dt className="inline font-semibold text-foreground">{t("popup.location")}:</dt>{" "}
                  <dd className="inline" dir="ltr">
                    {activeMarker.position.lat.toFixed(5)}, {activeMarker.position.lng.toFixed(5)}
                  </dd>
                </div>
                {activeMarker.recordedAt && (
                  <div>
                    <dt className="inline font-semibold text-foreground">{t("popup.lastUpdate")}:</dt>{" "}
                    <dd className="inline" dir="ltr">{formatInCompanyTz(activeMarker.recordedAt, zone, "dd-MM-yyyy HH:mm")}</dd>
                  </div>
                )}
                {typeof activeMarker.speed === "number" && (
                  <div>
                    <dt className="inline font-semibold text-foreground">{t("popup.speed")}:</dt>{" "}
                    <dd className="inline">
                      {activeMarker.speed} {t("popup.unitKmh")}
                    </dd>
                  </div>
                )}
                {typeof activeMarker.totalPoints === "number" && (
                  <div>
                    <dt className="inline font-semibold text-foreground">{t("summary.pointsInPeriod")}:</dt>{" "}
                    <dd className="inline">{activeMarker.totalPoints.toLocaleString("en")}</dd>
                  </div>
                )}
              </dl>
            </div>
          </InfoWindow>
        )}
      </Map>
    </APIProvider>
  );
}

function DeckHeatmap({ cells, style }: { cells: HeatmapCell[]; style: HeatmapStyle }) {
  const map = useMap();
  const overlay = useRef<GoogleMapsOverlay | null>(null);
  const layers = useMemo(
    () =>
      style.visible && cells.length > 0
        ? [
            new HeatmapLayer<HeatmapCell>({
              id: "heatmap",
              data: cells,
              getPosition: (d) => [d.lng, d.lat],
              getWeight: (d) => d.weight,
              aggregation: "SUM",
              radiusPixels: style.radius,
              opacity: style.opacity,
              colorRange: style.colorRange,
            }),
          ]
        : [],
    [cells, style],
  );
  const latestLayers = useRef(layers);

  useEffect(() => {
    latestLayers.current = layers;
    overlay.current?.setProps({ layers });
  }, [layers]);

  useEffect(() => {
    if (!map) return;
    let o: GoogleMapsOverlay | null = null;
    const attach = () => {
      o = new GoogleMapsOverlay({ interleaved: false, layers: latestLayers.current });
      o.setMap(map);
      overlay.current = o;
    };
    let pending: google.maps.MapsEventListener | null = null;
    if (map.getRenderingType() === google.maps.RenderingType.UNINITIALIZED) {
      pending = map.addListener("renderingtype_changed", () => {
        pending?.remove();
        pending = null;
        attach();
      });
    } else {
      attach();
    }
    return () => {
      pending?.remove();
      o?.finalize();
      overlay.current = null;
    };
  }, [map]);

  return null;
}

function FitBounds({ bounds, fitKey }: { bounds: Bbox | null; fitKey: number }) {
  const map = useMap();
  const lastFittedKey = useRef<number>(-1);

  useEffect(() => {
    if (!map || !bounds || fitKey < 0) return;
    if (lastFittedKey.current === fitKey) return;
    lastFittedKey.current = fitKey;
    map.fitBounds(bounds, 64);
  }, [map, bounds, fitKey]);

  return null;
}
