import type { ApiError } from "@/lib/graphql/errors";
import type { KleverResult } from "@/lib/graphql/klever";
import {
  HEATMAP_DEVICE_IDS,
  HEATMAP_POSITIONS,
  HEATMAP_VEHICLE_IDS,
  type HeatmapPositionsResult,
  type IdPage,
} from "@/lib/graphql/operations";
import { aggregateHeatmap, type HeatmapResult, type RawPosition } from "./aggregate";
import type { HeatmapParams } from "./request";

/**
 * Builds a heatmap from Klever's `positionHistory`. Klever has no aggregate query, so this pulls
 * the fixes page by page on the server and aggregates them here; the browser only gets cells.
 */

export type Requester = <T>(query: string, variables: Record<string, unknown>) => Promise<KleverResult<T>>;

export type HeatmapResponse = HeatmapResult & { from: string; to: string; weight_mode: HeatmapParams["mode"] };
export type HeatmapErrorBody = { message: string; kind?: string; errors?: Record<string, string[]> };
export type HeatmapOutcome = { status: 200; body: HeatmapResponse } | { status: number; body: HeatmapErrorBody };

/** Points fetched per request. Matches the history screen; the API's own page cap is unknown. */
export const PAGE_SIZE = 1000;
/** Above this the request would take minutes through the API; ask for a narrower range instead. */
export const MAX_POINTS = 300_000;
const CONCURRENCY = 4;
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX_ENTRIES = 30;

type Target = { kind: "vehicle" | "device"; id: string };

class UpstreamError extends Error {
  constructor(public readonly error: ApiError) {
    super(error.message);
  }
}

// Fixes per (session, target, window), so zooming re-aggregates without refetching from Klever.
const trackCache = new Map<string, { expires: number; track: RawPosition[] }>();

function cacheGet(key: string): RawPosition[] | undefined {
  const hit = trackCache.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    trackCache.delete(key);
    return undefined;
  }
  return hit.track;
}

function cacheSet(key: string, track: RawPosition[]) {
  if (trackCache.size >= CACHE_MAX_ENTRIES) trackCache.delete(trackCache.keys().next().value!);
  trackCache.set(key, { expires: Date.now() + CACHE_TTL_MS, track });
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function unwrap<T>(result: Promise<KleverResult<T>>): Promise<T> {
  const r = await result;
  if (!r.ok) throw new UpstreamError(r.error);
  return r.data;
}

/** Every vehicle or device ID the token's company can see. */
async function companyIds(request: Requester, kind: Target["kind"]): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let page = 1, last = 1; page <= last && page <= 100; page++) {
    if (kind === "vehicle") {
      const res = await unwrap(request<IdPage<"vehicles">>(HEATMAP_VEHICLE_IDS, { first: 100, page }));
      res.vehicles.data.forEach((v) => ids.add(v.id));
      last = res.vehicles.paginatorInfo?.lastPage ?? 1;
    } else {
      const res = await unwrap(request<IdPage<"devices">>(HEATMAP_DEVICE_IDS, { first: 100, page }));
      res.devices.data.forEach((d) => ids.add(d.id));
      last = res.devices.paginatorInfo?.lastPage ?? 1;
    }
  }
  return ids;
}

function positionsPage(request: Requester, target: Target, params: HeatmapParams, page: number) {
  return unwrap(
    request<HeatmapPositionsResult>(HEATMAP_POSITIONS, {
      [target.kind === "vehicle" ? "vehicleId" : "deviceId"]: target.id,
      from: params.from,
      to: params.to,
      first: PAGE_SIZE,
      page,
    }),
  ).then((r) => r.positionHistory);
}

function statusFor(error: ApiError): number {
  if (error.kind === "unauthenticated") return 401;
  if (error.kind === "forbidden") return 403;
  if (error.kind === "validation") return 422;
  return 502;
}

export async function buildHeatmap(
  params: HeatmapParams,
  request: Requester,
  cacheScope: string,
): Promise<HeatmapOutcome> {
  const targets: Target[] = [
    ...params.vehicleIds.map((id) => ({ kind: "vehicle" as const, id })),
    ...params.deviceIds.map((id) => ({ kind: "device" as const, id })),
  ];

  try {
    // Company scoping: Klever scopes by token, so check every ID against the company's own lists.
    const errors: Record<string, string[]> = {};
    for (const kind of ["vehicle", "device"] as const) {
      const wanted = targets.filter((t) => t.kind === kind);
      if (wanted.length === 0) continue;
      const own = await companyIds(request, kind);
      if (wanted.some((t) => !own.has(t.id))) errors[`${kind}_ids`] = ["notInCompany"];
    }
    if (Object.keys(errors).length > 0) {
      return { status: 422, body: { message: "Some vehicles don't belong to your company.", errors } };
    }

    const key = (t: Target) => [cacheScope, t.kind, t.id, params.from, params.to].join("|");
    const tracks = new Map<Target, RawPosition[]>();
    for (const t of targets) {
      const cached = cacheGet(key(t));
      if (cached) tracks.set(t, cached);
    }
    const pending = targets.filter((t) => !tracks.has(t));

    // First pages tell us the total, so an oversized request fails before we fetch it all.
    const firsts = await mapLimit(pending, CONCURRENCY, (t) => positionsPage(request, t, params, 1));
    const total = firsts.reduce((sum, p) => sum + (p.paginatorInfo?.total ?? p.data.length), 0);
    if (total > MAX_POINTS) {
      return {
        status: 422,
        body: {
          message: `The selection has ${total} GPS points; the limit is ${MAX_POINTS}.`,
          errors: { to: ["tooManyPoints"] },
        },
      };
    }

    const rest = pending.flatMap((t, i) => {
      const last = Math.min(firsts[i].paginatorInfo?.lastPage ?? 1, Math.ceil(MAX_POINTS / PAGE_SIZE));
      return Array.from({ length: Math.max(0, last - 1) }, (_, n) => ({ target: t, index: i, page: n + 2 }));
    });
    const pages = await mapLimit(rest, CONCURRENCY, (job) => positionsPage(request, job.target, params, job.page));

    pending.forEach((t, i) => {
      const track = [...firsts[i].data];
      rest.forEach((job, j) => {
        if (job.index === i) track.push(...pages[j].data);
      });
      tracks.set(t, track);
      cacheSet(key(t), track);
    });

    const result = aggregateHeatmap([...tracks.values()], { mode: params.mode, zoom: params.zoom, bbox: params.bbox });
    return { status: 200, body: { ...result, from: params.from, to: params.to, weight_mode: params.mode } };
  } catch (err) {
    if (err instanceof UpstreamError) {
      return {
        status: statusFor(err.error),
        body: { message: err.error.message, kind: err.error.kind, errors: err.error.fields },
      };
    }
    throw err;
  }
}

/** Test hook: forget cached fixes. */
export function clearHeatmapCache() {
  trackCache.clear();
}
