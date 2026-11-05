"use client";

import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker, NavigationControl, Popup, useControl, useMap } from "react-map-gl/maplibre";
import type { Bbox, HeatmapCell } from "@/lib/heatmap/aggregate";
import { DEFAULT_VIEW, maptilerStyleUrl } from "@/lib/maplibre";
import type { HeatmapMapProps, HeatmapStyle } from "./heatmap-map";
import { VehicleMarkerIcon, VehicleMarkerPopup, type VehicleMapMarker } from "./heatmap-marker";

/**
 * The heatmap on OpenStreetMap (MapTiler tiles, MapLibre): the same deck.gl HeatmapLayer, markers,
 * popup and fit-on-"Show" behaviour as the Google version in heatmap-map.tsx.
 */
export default function HeatmapOsmMap({
  maptilerKey,
  cells,
  bounds,
  fitKey,
  style,
  onZoomChange,
  markers,
}: HeatmapMapProps & { maptilerKey: string }) {
  const [activeMarker, setActiveMarker] = useState<VehicleMapMarker | null>(null);

  return (
    <Map
      initialViewState={{ ...DEFAULT_VIEW, zoom: 11 }}
      mapStyle={maptilerStyleUrl(maptilerKey)}
      style={{ width: "100%", height: "100%" }}
      attributionControl={{ compact: true }}
      onZoomEnd={(e) => onZoomChange(e.viewState.zoom)}
      onLoad={(e) => onZoomChange(e.target.getZoom())}
    >
      <NavigationControl position="bottom-right" showCompass={false} />
      <DeckHeatmap cells={cells} style={style} />
      <FitBounds bounds={bounds} fitKey={fitKey} />
      {markers?.map((m) => (
        <Marker
          key={m.id}
          latitude={m.position.lat}
          longitude={m.position.lng}
          anchor="center"
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            setActiveMarker(m);
          }}
        >
          <div title={m.label}>
            <VehicleMarkerIcon marker={m} />
          </div>
        </Marker>
      ))}
      {activeMarker ? (
        <Popup
          latitude={activeMarker.position.lat}
          longitude={activeMarker.position.lng}
          anchor="bottom"
          offset={22}
          closeOnClick={false}
          onClose={() => setActiveMarker(null)}
          maxWidth="320px"
        >
          <VehicleMarkerPopup marker={activeMarker} />
        </Popup>
      ) : null}
    </Map>
  );
}

/** deck.gl's HeatmapLayer drawn over MapLibre through MapboxOverlay (works with MapLibre too). */
function DeckHeatmap({ cells, style }: { cells: HeatmapCell[]; style: HeatmapStyle }) {
  const overlay = useControl(() => new MapboxOverlay({ interleaved: false, layers: [] }));
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
  useEffect(() => {
    overlay.setProps({ layers });
  }, [overlay, layers]);
  return null;
}

/** Fits to `bounds` once per "Show" (fitKey), not on the refetches zooming triggers. */
function FitBounds({ bounds, fitKey }: { bounds: Bbox | null; fitKey: number }) {
  const { current: map } = useMap();
  const lastFittedKey = useRef<number>(-1);
  useEffect(() => {
    if (!map || !bounds || fitKey < 0) return;
    if (lastFittedKey.current === fitKey) return;
    lastFittedKey.current = fitKey;
    map.fitBounds(
      [
        [bounds.west, bounds.south],
        [bounds.east, bounds.north],
      ],
      { padding: 64, duration: 0 },
    );
  }, [map, bounds, fitKey]);
  return null;
}
