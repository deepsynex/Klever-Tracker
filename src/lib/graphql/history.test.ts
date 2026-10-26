import { describe, expect, it, vi } from "vitest";

// Stub Next.js server-only marker in Node vitest environment
vi.mock("server-only", () => ({}));

import { mockFetch } from "./mock";

const VALID_TOKEN = "mock-token-1";

describe("History & Tracking Mock API", () => {
  it("returns vehicles for company dropdown", async () => {
    const res = await mockFetch(JSON.stringify({ query: "query { vehicles { data { id plateNo status } } }" }), VALID_TOKEN);
    const body = JSON.parse(res.text);
    expect(res.status).toBe(200);
    expect(body.data?.vehicles?.data).toHaveLength(3);
    expect(body.data.vehicles.data[0].plateNo).toBe("DXB-A-12345");
  });

  it("returns routes and route points", async () => {
    const res = await mockFetch(JSON.stringify({ query: "query { routes { data { id name } } }" }), VALID_TOKEN);
    const body = JSON.parse(res.text);
    expect(res.status).toBe(200);
    expect(body.data?.routes?.data).toHaveLength(2);

    const detailRes = await mockFetch(JSON.stringify({ query: "query { route(id: 1) { id points { id sequence } } }" }), VALID_TOKEN);
    const detailBody = JSON.parse(detailRes.text);
    expect(detailBody.data?.route?.points).toHaveLength(3);
  });

  it("returns event types and alert events", async () => {
    const res = await mockFetch(JSON.stringify({ query: "query { eventTypes { data { id name code } } }" }), VALID_TOKEN);
    const body = JSON.parse(res.text);
    expect(res.status).toBe(200);
    expect(body.data?.eventTypes?.data.length).toBeGreaterThanOrEqual(9);

    const alertsRes = await mockFetch(JSON.stringify({ query: "query { alertEvents { data { id eventTypeId } } }" }), VALID_TOKEN);
    const alertsBody = JSON.parse(alertsRes.text);
    expect(alertsBody.data?.alertEvents?.data.length).toBeGreaterThan(0);
  });

  it("returns valid chronological position history for a vehicle", async () => {
    const res = await mockFetch(
      JSON.stringify({
        query: 'query { positionHistory(vehicleId: 1, from: "2026-10-12T14:00:00Z", to: "2026-10-12T18:00:00Z") { data { recordedAt locationLat locationLng speed } } }',
      }),
      VALID_TOKEN,
    );
    const body = JSON.parse(res.text);
    expect(res.status).toBe(200);
    const points = body.data?.positionHistory?.data;
    expect(points).toBeDefined();
    expect(points.length).toBeGreaterThan(10);
    expect(points[0].locationLat).toBeCloseTo(25.1972, 2);
    expect(points[0].locationLng).toBeCloseTo(55.2744, 2);
  });

  it("rejects unauthenticated requests", async () => {
    const res = await mockFetch(JSON.stringify({ query: "query { vehicles { data { id } } }" }), "bad-token");
    const body = JSON.parse(res.text);
    expect(body.errors[0].message).toBe("Unauthenticated.");
  });
});
