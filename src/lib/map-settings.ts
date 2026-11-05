"use client";

import { useQuery } from "@tanstack/react-query";
import { ApiRequestError, gqlRequest } from "@/lib/graphql/client";
import { useMe } from "@/lib/permissions";

/**
 * Which base map the whole platform uses, set by a super admin on /map-settings: Google Maps or
 * OpenStreetMap (MapTiler tiles). Every map screen reads it through useMapConfig().
 *
 * Stored on the backend (platformSettings, M1): the provider and the MapTiler key. The Google key
 * and Map ID always come from the deployment's env (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY / _MAP_ID),
 * never from the database. If the setting can't be read, the app uses Google Maps.
 *
 * The MapTiler key is a browser key: it ends up in every visitor's tile URLs anyway, so serving it
 * is fine as long as it is restricted to this site's domains in the MapTiler dashboard.
 */

export type MapProvider = "google" | "osm";

/** What the backend stores and the settings page edits. */
export type StoredMapSettings = {
  mapProvider: MapProvider;
  maptilerApiKey: string | null;
};

/** What the map screens use: the stored choice plus Google's env key and Map ID. */
export type PlatformMapSettings = StoredMapSettings & {
  googleMapsApiKey: string | null;
  googleMapsMapId: string | null;
};

export const PLATFORM_SETTINGS = /* GraphQL */ `
  query PlatformSettings {
    platformSettings {
      mapProvider
      maptilerApiKey
    }
  }
`;

export const UPDATE_PLATFORM_SETTINGS = /* GraphQL */ `
  mutation UpdatePlatformSettings($mapProvider: String, $maptilerApiKey: String) {
    updatePlatformSettings(mapProvider: $mapProvider, maptilerApiKey: $maptilerApiKey) {
      mapProvider
      maptilerApiKey
    }
  }
`;

export const IS_SUPER_ADMIN = /* GraphQL */ `
  query MeIsSuperAdmin {
    me {
      isSuperAdmin
    }
  }
`;

/** Google Maps with the deployment's key: the default, and the fallback when the setting can't be read. */
export function envMapSettings(): PlatformMapSettings {
  return {
    mapProvider: "google",
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || null,
    googleMapsMapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || null,
    maptilerApiKey: null,
  };
}

/** True when the API simply doesn't have the field or operation yet (schema validation error). */
export function isMissingFromApi(err: unknown): boolean {
  const message = err instanceof ApiRequestError ? err.error.message : err instanceof Error ? err.message : "";
  return /Cannot query field|Unknown argument|isn't available in mock mode/i.test(message);
}

/**
 * The stored choice with Google's env key and Map ID. "osm" without a MapTiler key falls back to
 * Google (a map that can't load tiles helps nobody).
 */
export function resolveMapSettings(stored: Partial<StoredMapSettings> | null | undefined): PlatformMapSettings {
  const env = envMapSettings();
  const merged: PlatformMapSettings = {
    ...env,
    mapProvider: stored?.mapProvider === "osm" ? "osm" : "google",
    maptilerApiKey: stored?.maptilerApiKey?.trim() || null,
  };
  if (merged.mapProvider === "osm" && !merged.maptilerApiKey) merged.mapProvider = "google";
  return merged;
}

/** MapTiler's OpenStreetMap-based street style for MapLibre. */
export function maptilerStyleUrl(key: string): string {
  return `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(key)}`;
}

export type MapConfig = PlatformMapSettings & {
  /** False while the setting is loading: don't draw a map yet, or it would flash the wrong one. */
  ready: boolean;
  /** True when the values come from the backend, false when it is the env fallback. */
  fromApi: boolean;
};

/** The stored settings as the API returns them (null fields = not set). Shared cache with useMapConfig. */
export function usePlatformSettingsQuery() {
  return useQuery({
    queryKey: PLATFORM_SETTINGS_KEY,
    queryFn: async () => (await gqlRequest<{ platformSettings: StoredMapSettings | null }>(PLATFORM_SETTINGS)).platformSettings,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export const PLATFORM_SETTINGS_KEY = ["platform-settings"] as const;

export function useMapConfig(): MapConfig {
  const q = usePlatformSettingsQuery();
  if (q.isPending) return { ...envMapSettings(), ready: false, fromApi: false };
  if (q.isError || !q.data) return { ...envMapSettings(), ready: true, fromApi: false };
  return { ...resolveMapSettings(q.data), ready: true, fromApi: true };
}

/**
 * Whether the signed-in user may manage platform-wide settings: platform staff (no company: the
 * same rule as `isPlatform` on the masters screens) or a super admin. Platform staff are known from
 * `me` today; `isSuperAdmin` counts once the backend adds it to `me` (M2) and is false until then.
 */
export function useIsSuperAdmin(): { isSuperAdmin: boolean; isPending: boolean; apiMissing: boolean } {
  const me = useMe();
  const q = useQuery({
    queryKey: ["me", "isSuperAdmin"],
    queryFn: async () => (await gqlRequest<{ me: { isSuperAdmin: boolean } }>(IS_SUPER_ADMIN)).me.isSuperAdmin,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const isPlatformStaff = me.data ? me.data.companyId === null : false;
  return {
    isSuperAdmin: isPlatformStaff || q.data === true,
    // Settled once `me` is known and either it already says platform staff or the flag query is done.
    isPending: me.isPending || (!isPlatformStaff && q.isPending),
    apiMissing: q.isError && isMissingFromApi(q.error),
  };
}
