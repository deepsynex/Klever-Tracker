import { z } from "zod";
import { WEIGHT_MODES, type Bbox, type WeightMode } from "./aggregate";

/**
 * Query-string validation for GET /api/heatmap. Error messages are translation keys under
 * `heatmap.errors.*` in messages/*.json, returned per field like a Laravel 422.
 */

export const MAX_RANGE_DAYS = 31;
export const MAX_TARGETS = 50;
const DAY_MS = 86_400_000;

export type HeatmapParams = {
  vehicleIds: string[];
  deviceIds: string[];
  from: string;
  to: string;
  mode: WeightMode;
  zoom: number;
  bbox: Bbox | null;
};

const id = z.string().regex(/^\d+$/, "invalidId");

const schema = z
  .object({
    vehicle_ids: z.array(id),
    device_ids: z.array(id),
    from: z.iso.datetime({ offset: true, error: "invalidDate" }),
    to: z.iso.datetime({ offset: true, error: "invalidDate" }),
    weight_mode: z.enum(WEIGHT_MODES, "invalidMode").default("density"),
    zoom: z.coerce.number("invalidZoom").int("invalidZoom").min(0, "invalidZoom").max(22, "invalidZoom").default(12),
    bbox: z
      .string()
      .transform((s, ctx) => {
        const n = s.split(",").map(Number);
        const [west, south, east, north] = n;
        const ok =
          n.length === 4 &&
          n.every(Number.isFinite) &&
          south >= -90 &&
          north <= 90 &&
          west >= -180 &&
          east <= 180 &&
          south < north &&
          west < east;
        if (!ok) {
          ctx.addIssue({ code: "custom", message: "invalidBbox" });
          return z.NEVER;
        }
        return { south, west, north, east } satisfies Bbox;
      })
      .optional(),
    company_id: z.undefined("companyScopeUnavailable"),
  })
  .superRefine((v, ctx) => {
    const count = new Set(v.vehicle_ids).size + new Set(v.device_ids).size;
    if (count === 0) ctx.addIssue({ code: "custom", path: ["vehicle_ids"], message: "vehiclesRequired" });
    if (count > MAX_TARGETS) ctx.addIssue({ code: "custom", path: ["vehicle_ids"], message: "tooManyVehicles" });

    const from = Date.parse(v.from);
    const to = Date.parse(v.to);
    if (from >= to) ctx.addIssue({ code: "custom", path: ["to"], message: "toBeforeFrom" });
    else if (to - from > MAX_RANGE_DAYS * DAY_MS)
      ctx.addIssue({ code: "custom", path: ["to"], message: "rangeTooLong" });
  });

export type ParseResult = { ok: true; params: HeatmapParams } | { ok: false; errors: Record<string, string[]> };

/** Accepts `vehicle_ids[]=1&vehicle_ids[]=2` and `vehicle_ids=1,2`. */
function ids(search: URLSearchParams, name: string): string[] {
  return [...search.getAll(`${name}[]`), ...search.getAll(name)]
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
}

export function parseHeatmapQuery(search: URLSearchParams): ParseResult {
  const optional = (name: string) => search.get(name) ?? undefined;
  const result = schema.safeParse({
    vehicle_ids: ids(search, "vehicle_ids"),
    device_ids: ids(search, "device_ids"),
    from: search.get("from") ?? "",
    to: search.get("to") ?? "",
    weight_mode: optional("weight_mode"),
    zoom: optional("zoom"),
    bbox: optional("bbox"),
    company_id: optional("company_id"),
  });

  if (!result.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const field = String(issue.path[0] ?? "form");
      const list = (errors[field] ??= []);
      if (!list.includes(issue.message)) list.push(issue.message);
    }
    return { ok: false, errors };
  }

  const v = result.data;
  return {
    ok: true,
    params: {
      vehicleIds: [...new Set(v.vehicle_ids)],
      deviceIds: [...new Set(v.device_ids)],
      from: new Date(v.from).toISOString(),
      to: new Date(v.to).toISOString(),
      mode: v.weight_mode,
      zoom: v.zoom,
      bbox: v.bbox ?? null,
    },
  };
}
