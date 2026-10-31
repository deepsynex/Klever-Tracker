import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoPositions } from "./demo-tracks";
import type { HeatmapParams } from "./request";
import { MAX_POINTS, buildHeatmap, clearHeatmapCache, type Requester } from "./service";

const PARAMS: HeatmapParams = {
  vehicleIds: ["1"],
  deviceIds: [],
  from: "2026-10-12T00:00:00.000Z",
  to: "2026-10-13T00:00:00.000Z",
  mode: "dwell",
  zoom: 13,
  bbox: null,
};

/** A fake Klever API: the token's company owns vehicles 1–3 and device 1; fixes come from the demo data. */
function fakeApi(overrides: { total?: number } = {}) {
  const calls: { query: string; variables: Record<string, unknown> }[] = [];
  const request = vi.fn(async (query: string, variables: Record<string, unknown>) => {
    calls.push({ query, variables });
    if (query.includes("HeatmapVehicleIds")) {
      return {
        ok: true,
        data: { vehicles: { data: [{ id: "1" }, { id: "2" }, { id: "3" }], paginatorInfo: { lastPage: 1 } } },
      };
    }
    if (query.includes("HeatmapDeviceIds")) {
      return { ok: true, data: { devices: { data: [{ id: "1" }], paginatorInfo: { lastPage: 1 } } } };
    }
    const all = demoPositions({
      vehicleId: variables.vehicleId as string | undefined,
      deviceId: variables.deviceId as string | undefined,
      from: variables.from as string,
      to: variables.to as string,
    });
    const first = variables.first as number;
    const page = variables.page as number;
    return {
      ok: true,
      data: {
        positionHistory: {
          data: all.slice((page - 1) * first, page * first),
          paginatorInfo: { total: overrides.total ?? all.length, lastPage: Math.max(1, Math.ceil(all.length / first)) },
        },
      },
    };
  }) as unknown as Requester;
  return { request, calls };
}

beforeEach(() => clearHeatmapCache());

describe("buildHeatmap", () => {
  it("rejects vehicles outside the user's company with 422 and fetches no positions", async () => {
    const { request, calls } = fakeApi();
    const out = await buildHeatmap({ ...PARAMS, vehicleIds: ["1", "77"] }, request, "s1");
    expect(out.status).toBe(422);
    expect(out.body).toMatchObject({ errors: { vehicle_ids: ["notInCompany"] } });
    expect(calls.some((c) => c.query.includes("positionHistory"))).toBe(false);
  });

  it("checks devices against the company's device list", async () => {
    const { request } = fakeApi();
    const out = await buildHeatmap({ ...PARAMS, vehicleIds: [], deviceIds: ["2"] }, request, "s1");
    expect(out.body).toMatchObject({ errors: { device_ids: ["notInCompany"] } });
  });

  it("pages through positionHistory and returns cells, not points", async () => {
    const { request, calls } = fakeApi();
    // A week: more than one 1,000-point page per vehicle.
    const week = { ...PARAMS, to: "2026-10-19T00:00:00.000Z", vehicleIds: ["1", "2", "3"] };
    const out = await buildHeatmap(week, request, "s1");
    expect(out.status).toBe(200);
    if (out.status !== 200 || !("cells" in out.body)) throw new Error("expected cells");
    const pageCalls = calls.filter((c) => c.query.includes("positionHistory"));
    expect(pageCalls.length).toBeGreaterThan(3); // more than one page for at least one vehicle
    expect(out.body.total_points).toBeGreaterThan(1000);
    expect(out.body.cell_count).toBeLessThan(out.body.total_points);
    expect(out.body.dropped_points).toBeGreaterThan(0); // vehicle 3's bad fixes
    expect(out.body.bounds).not.toBeNull();
    expect(Object.keys(out.body.cells[0]).sort()).toEqual(["lat", "lng", "weight"]);
  });

  it("re-aggregates a new zoom from cache without calling the API again", async () => {
    const { request, calls } = fakeApi();
    await buildHeatmap(PARAMS, request, "s1");
    const before = calls.filter((c) => c.query.includes("positionHistory")).length;
    const out = await buildHeatmap({ ...PARAMS, zoom: 16 }, request, "s1");
    expect(out.status).toBe(200);
    expect(calls.filter((c) => c.query.includes("positionHistory")).length).toBe(before);
  });

  it("does not share cached fixes between sessions", async () => {
    const { request, calls } = fakeApi();
    await buildHeatmap(PARAMS, request, "s1");
    const before = calls.length;
    await buildHeatmap(PARAMS, request, "s2");
    expect(calls.length).toBeGreaterThan(before);
  });

  it("refuses selections over the point budget before fetching every page", async () => {
    const { request, calls } = fakeApi({ total: MAX_POINTS + 1 });
    const out = await buildHeatmap(PARAMS, request, "s1");
    expect(out.status).toBe(422);
    expect(out.body).toMatchObject({ errors: { to: ["tooManyPoints"] } });
    expect(calls.filter((c) => c.query.includes("positionHistory"))).toHaveLength(1);
  });

  it.each([
    ["unauthenticated", 401],
    ["forbidden", 403],
    ["network", 502],
  ] as const)("maps upstream %s to HTTP %i", async (kind, status) => {
    const request = (async () => ({ ok: false, error: { kind, message: "x" } })) as unknown as Requester;
    const out = await buildHeatmap(PARAMS, request, "s1");
    expect(out).toMatchObject({ status, body: { kind } });
  });
});
