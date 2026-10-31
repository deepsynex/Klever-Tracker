"use client";

import type { WeightMode } from "./aggregate";
import type { HeatmapErrorBody, HeatmapResponse } from "./service";

export type HeatmapQuery = {
  vehicleIds: string[];
  deviceIds: string[];
  from: string;
  to: string;
  mode: WeightMode;
  zoom: number;
};

export class HeatmapRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: HeatmapErrorBody | null,
  ) {
    super(body?.message ?? `HTTP ${status}`);
    this.name = "HeatmapRequestError";
  }
}

export function heatmapUrl(q: HeatmapQuery): string {
  const search = new URLSearchParams();
  q.vehicleIds.forEach((id) => search.append("vehicle_ids[]", id));
  q.deviceIds.forEach((id) => search.append("device_ids[]", id));
  search.set("from", q.from);
  search.set("to", q.to);
  search.set("weight_mode", q.mode);
  search.set("zoom", String(q.zoom));
  return `/api/heatmap?${search}`;
}

/** TanStack Query `queryFn` for GET /api/heatmap. Sends signed-out users to login like gqlRequest. */
export async function fetchHeatmap(q: HeatmapQuery, signal?: AbortSignal): Promise<HeatmapResponse> {
  let res: Response;
  try {
    res = await fetch(heatmapUrl(q), { credentials: "same-origin", signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new HeatmapRequestError(0, null);
  }
  const body = (await res.json().catch(() => null)) as HeatmapResponse | HeatmapErrorBody | null;
  if (res.ok) return body as HeatmapResponse;

  if (res.status === 401 && typeof window !== "undefined") {
    const locale = document.documentElement.lang || "en";
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/${locale}/login?next=${next}`);
  }
  throw new HeatmapRequestError(res.status, body as HeatmapErrorBody | null);
}

export type Rgb = [number, number, number];

/** deck.gl colour ranges, low → high. */
export const GRADIENTS = {
  greenRed: [
    [26, 152, 80],
    [145, 207, 96],
    [217, 239, 139],
    [254, 224, 139],
    [252, 141, 89],
    [215, 48, 39],
  ],
  cyanRed: [
    [0, 255, 255],
    [0, 191, 255],
    [0, 127, 255],
    [0, 63, 255],
    [127, 0, 191],
    [255, 0, 0],
  ],
} satisfies Record<string, Rgb[]>;
export type GradientName = keyof typeof GRADIENTS;

export const DUBAI_CENTER = { lat: 25.2047, lng: 55.2707 };
