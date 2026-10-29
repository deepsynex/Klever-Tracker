import { describe, expect, it } from "vitest";
import { parseHeatmapQuery } from "./request";

function parse(query: string) {
  return parseHeatmapQuery(new URLSearchParams(query));
}

const RANGE = "from=2026-10-01T00:00:00Z&to=2026-10-02T00:00:00Z";

describe("parseHeatmapQuery", () => {
  it("accepts a valid request and applies defaults", () => {
    const r = parse(`vehicle_ids[]=1&vehicle_ids[]=2&vehicle_ids[]=2&${RANGE}`);
    expect(r).toEqual({
      ok: true,
      params: {
        vehicleIds: ["1", "2"],
        deviceIds: [],
        from: "2026-10-01T00:00:00.000Z",
        to: "2026-10-02T00:00:00.000Z",
        mode: "density",
        zoom: 12,
        bbox: null,
      },
    });
  });

  it("parses comma lists, offsets, mode, zoom and bbox", () => {
    const r = parse(
      "device_ids=3,4&from=2026-10-01T04:00:00%2B04:00&to=2026-10-01T10:00:00Z&weight_mode=idle&zoom=15&bbox=55.1,25.0,55.4,25.3",
    );
    expect(r.ok && r.params).toMatchObject({
      deviceIds: ["3", "4"],
      from: "2026-10-01T00:00:00.000Z",
      mode: "idle",
      zoom: 15,
      bbox: { west: 55.1, south: 25.0, east: 55.4, north: 25.3 },
    });
  });

  it.each([
    ["no vehicles", RANGE, { vehicle_ids: ["vehiclesRequired"] }],
    ["from after to", "vehicle_ids[]=1&from=2026-10-02T00:00:00Z&to=2026-10-01T00:00:00Z", { to: ["toBeforeFrom"] }],
    ["from equals to", "vehicle_ids[]=1&from=2026-10-01T00:00:00Z&to=2026-10-01T00:00:00Z", { to: ["toBeforeFrom"] }],
    ["over 31 days", "vehicle_ids[]=1&from=2026-09-01T00:00:00Z&to=2026-10-02T00:00:01Z", { to: ["rangeTooLong"] }],
    ["bad dates", "vehicle_ids[]=1&from=yesterday&to=", { from: ["invalidDate"], to: ["invalidDate"] }],
    ["bad mode", `vehicle_ids[]=1&${RANGE}&weight_mode=speed`, { weight_mode: ["invalidMode"] }],
    ["bad zoom", `vehicle_ids[]=1&${RANGE}&zoom=30`, { zoom: ["invalidZoom"] }],
    ["bad bbox", `vehicle_ids[]=1&${RANGE}&bbox=55.4,25.3,55.1,25.0`, { bbox: ["invalidBbox"] }],
    ["bad id", `vehicle_ids[]=abc&${RANGE}`, { vehicle_ids: ["invalidId"] }],
    ["company_id", `vehicle_ids[]=1&${RANGE}&company_id=2`, { company_id: ["companyScopeUnavailable"] }],
  ])("rejects %s", (_name, query, errors) => {
    expect(parse(query)).toEqual({ ok: false, errors });
  });

  it("allows exactly 31 days and 50 vehicles, not 51", () => {
    const fifty = Array.from({ length: 50 }, (_, i) => `vehicle_ids[]=${i + 1}`).join("&");
    expect(parse(`${fifty}&from=2026-09-01T00:00:00Z&to=2026-10-02T00:00:00Z`).ok).toBe(true);
    expect(parse(`${fifty}&device_ids[]=99&${RANGE}`)).toEqual({
      ok: false,
      errors: { vehicle_ids: ["tooManyVehicles"] },
    });
  });
});
