"use client";

import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import { APIProvider, Map, useMap, type MapCameraChangedEvent } from "@vis.gl/react-google-maps";
import { useEffect, useMemo, useRef } from "react";
import type { Bbox, HeatmapCell } from "@/lib/heatmap/aggregate";
import { DUBAI_CENTER, type Rgb } from "@/lib/heatmap/client";

export type HeatmapStyle = { visible: boolean; colorRange: Rgb[]; opacity: number; radius: number };

type Props = {
  apiKey: string;
  cells: HeatmapCell[];
  bounds: Bbox | null;
  /** Changes once per "Show"; the map fits to `bounds` when it changes, not on zoom refetches. */
  fitKey: number;
  style: HeatmapStyle;
  onZoomChange: (zoom: number) => void;
};

/** Google base map with a deck.gl HeatmapLayer. Loaded with `ssr: false` (WebGL needs a browser). */
export default function HeatmapMap({ apiKey, cells, bounds, fitKey, style, onZoomChange }: Props) {
  return (
    <APIProvider apiKey={apiKey}>
      <Map
        className="size-full"
        defaultCenter={DUBAI_CENTER}
        defaultZoom={11}
        gestureHandling="greedy"
        streetViewControl={false}
        mapTypeControl={false}
        onCameraChanged={(e: MapCameraChangedEvent) => onZoomChange(e.detail.zoom)}
      >
        <DeckHeatmap cells={cells} style={style} />
        <FitBounds bounds={bounds} fitKey={fitKey} />
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
    // Given a map that isn't initialised yet, deck.gl waits on a 'renderingtype_changed' listener it
    // never removes, which crashes once finalize() has run (Strict Mode remounts). Wait here instead.
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
  const fitted = useRef(-1);

  useEffect(() => {
    // A negative key means "results not ready yet"; keep the current view.
    if (!map || fitKey < 0 || fitted.current === fitKey) return;
    fitted.current = fitKey;
    if (!bounds) {
      map.setCenter(DUBAI_CENTER);
      map.setZoom(11);
    } else if (bounds.north - bounds.south < 0.002 && bounds.east - bounds.west < 0.002) {
      map.setCenter({ lat: (bounds.north + bounds.south) / 2, lng: (bounds.east + bounds.west) / 2 });
      map.setZoom(16);
    } else {
      map.fitBounds(bounds, 48);
    }
  }, [map, bounds, fitKey]);

  return null;
}
