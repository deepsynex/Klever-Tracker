"use client";

import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import { AdvancedMarker, APIProvider, InfoWindow, Map, useMap, type MapCameraChangedEvent } from "@vis.gl/react-google-maps";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Bbox, HeatmapCell } from "@/lib/heatmap/aggregate";
import { DUBAI_CENTER, type Rgb } from "@/lib/heatmap/client";
import { VehicleMarkerIcon, VehicleMarkerPopup, type VehicleMapMarker } from "./heatmap-marker";

export type { VehicleMapMarker };

export type HeatmapStyle = { visible: boolean; colorRange: Rgb[]; opacity: number; radius: number };

/** Shared by the Google map below and heatmap-osm-map.tsx. */
export type HeatmapMapProps = {
  cells: HeatmapCell[];
  bounds: Bbox | null;
  /** Changes once per "Show"; the map fits to `bounds` when it changes, not on zoom refetches. */
  fitKey: number;
  style: HeatmapStyle;
  onZoomChange: (zoom: number) => void;
  markers?: VehicleMapMarker[];
};

type Props = HeatmapMapProps & {
  apiKey: string;
  mapId?: string | null;
};

/** Google base map with a deck.gl HeatmapLayer and vehicle position markers. */
export default function HeatmapMap({ apiKey, mapId, cells, bounds, fitKey, style, onZoomChange, markers }: Props) {
  const [activeMarker, setActiveMarker] = useState<VehicleMapMarker | null>(null);

  return (
    <APIProvider apiKey={apiKey}>
      <Map
        className="size-full"
        mapId={mapId || "DEMO_MAP_ID"}
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
            <VehicleMarkerIcon marker={m} />
          </AdvancedMarker>
        ))}

        {activeMarker && (
          <InfoWindow
            position={activeMarker.position}
            onCloseClick={() => setActiveMarker(null)}
          >
            <VehicleMarkerPopup marker={activeMarker} />
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
