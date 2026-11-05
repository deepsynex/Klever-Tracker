"use client";

import { createContext, useContext } from "react";

/**
 * Which base map Multi Tracking draws (the platform setting from /map-settings), read once by
 * MultiTrackingView and shared with every tile, the single map and the backdrop.
 */
export type MapChoice = { provider: "google" | "osm"; maptilerKey: string | null; googleMapId: string | null };

const MapChoiceContext = createContext<MapChoice>({ provider: "google", maptilerKey: null, googleMapId: null });

export const MapChoiceProvider = MapChoiceContext.Provider;

export function useMapChoice(): MapChoice {
  return useContext(MapChoiceContext);
}
