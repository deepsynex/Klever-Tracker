"use client";

import { useEffect, type ReactNode } from "react";
import Map, { Marker, NavigationControl, useMap } from "react-map-gl/maplibre";
import { boundsOf, DEFAULT_VIEW, fitPadding, maptilerStyleUrl } from "@/lib/maplibre";

/**
 * Live map on OpenStreetMap (MapTiler tiles, drawn with MapLibre): the same arrows, hover cards
 * and follow behaviour as the Google version in live-tracking-view.tsx.
 */

export type OsmVehicle = { id: string; plateNo: string; lat: number | null; lng: number | null };

export function LiveOsmMap<V extends OsmVehicle>({
  maptilerKey,
  vehicles,
  selected,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  renderMarker,
}: {
  maptilerKey: string;
  vehicles: V[];
  selected: V | null;
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  renderMarker: (v: V) => ReactNode;
}) {
  return (
    <Map
      initialViewState={DEFAULT_VIEW}
      mapStyle={maptilerStyleUrl(maptilerKey)}
      style={{ width: "100%", height: "100%" }}
      attributionControl={{ compact: true }}
    >
      <NavigationControl position="bottom-right" showCompass={false} />
      <FollowController selected={selected} vehicles={vehicles} />
      {vehicles
        .filter((v) => v.lat && v.lng)
        .map((v) => {
          const isSelected = v.id === selectedId;
          const isHovered = v.id === hoveredId;
          return (
            <Marker
              key={v.id}
              latitude={v.lat!}
              longitude={v.lng!}
              anchor="center"
              // The hovered arrow's card, then the followed vehicle, sit above the others.
              style={{ zIndex: isHovered ? 3 : isSelected ? 2 : 1 }}
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                onSelect(v.id);
              }}
            >
              <div title={v.plateNo} onMouseEnter={() => onHover(v.id)} onMouseLeave={() => onHover(null)}>
                {renderMarker(v)}
              </div>
            </Marker>
          );
        })}
    </Map>
  );
}

/** Follows the selected vehicle, or fits every vehicle when none is selected. */
function FollowController({ selected, vehicles }: { selected: OsmVehicle | null; vehicles: OsmVehicle[] }) {
  const { current: map } = useMap();

  useEffect(() => {
    if (!map) return;
    if (selected?.lat && selected.lng) {
      map.flyTo({ center: [selected.lng, selected.lat], zoom: 14, duration: 800 });
      return;
    }
    const valid = vehicles.filter((v) => v.lat && v.lng);
    if (valid.length === 1) {
      map.flyTo({ center: [valid[0].lng!, valid[0].lat!], zoom: 13, duration: 0 });
    } else if (valid.length > 1) {
      // The vehicles panel (340px + gap) floats over the start side.
      map.fitBounds(boundsOf(valid.map((v) => ({ lat: v.lat!, lng: v.lng! })))!, { padding: fitPadding(380), duration: 0, maxZoom: 15 });
    }
  }, [map, selected, vehicles]);

  return null;
}
