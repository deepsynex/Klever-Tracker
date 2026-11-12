import { describe, expect, it } from "vitest";
import {
  boundsOf,
  circleRing,
  closeRing,
  destination,
  haversineM,
  isValidPolygon,
  openRing,
  parseAreaGeoJson,
  pointInCircle,
  pointInPolygon,
  polygonAreaM2,
  radiusHandle,
} from "./geometry";

const C = { lat: 23.083, lng: 72.499 };
// About 1 km square around C.
const SQUARE = [
  { lat: 23.0785, lng: 72.4941 },
  { lat: 23.0785, lng: 72.5039 },
  { lat: 23.0875, lng: 72.5039 },
  { lat: 23.0875, lng: 72.4941 },
];

describe("distances", () => {
  it("haversine and destination agree", () => {
    const p = destination(C, 500, 45);
    expect(haversineM(C, p)).toBeCloseTo(500, 3);
  });
  it("puts the radius handle due east at the radius", () => {
    const h = radiusHandle(C, 150);
    expect(h.lat).toBeCloseTo(C.lat, 4);
    expect(h.lng).toBeGreaterThan(C.lng);
    expect(haversineM(C, h)).toBeCloseTo(150, 3);
  });
});

describe("circleRing", () => {
  it("is closed, has steps + 1 points, all at the radius", () => {
    const ring = circleRing(C, 200, 32);
    expect(ring).toHaveLength(33);
    expect(ring[0]).toEqual(ring[32]);
    for (const [lng, lat] of ring) expect(haversineM(C, { lat, lng })).toBeCloseTo(200, 3);
  });
});

describe("rings", () => {
  it("closes and opens rings", () => {
    const closed = closeRing(SQUARE);
    expect(closed).toHaveLength(5);
    expect(closed[0]).toEqual(closed[4]);
    expect(openRing([...SQUARE, SQUARE[0]])).toHaveLength(4);
    expect(closeRing([])).toEqual([]);
  });
});

describe("polygons", () => {
  it("measures area (≈ 1 km²)", () => {
    expect(polygonAreaM2(SQUARE) / 1e6).toBeGreaterThan(0.95);
    expect(polygonAreaM2(SQUARE) / 1e6).toBeLessThan(1.05);
  });
  it("needs 3 distinct points with some area", () => {
    expect(isValidPolygon(SQUARE)).toBe(true);
    expect(isValidPolygon(SQUARE.slice(0, 2))).toBe(false);
    expect(isValidPolygon([SQUARE[0], SQUARE[0], SQUARE[1]])).toBe(false);
    // Three points on one line.
    expect(isValidPolygon([C, destination(C, 100, 90), destination(C, 200, 90)])).toBe(false);
  });
  it("tests points inside", () => {
    expect(pointInPolygon(C, SQUARE)).toBe(true);
    expect(pointInPolygon({ lat: 23.1, lng: 72.6 }, SQUARE)).toBe(false);
    expect(pointInCircle(destination(C, 99, 10), C, 100)).toBe(true);
    expect(pointInCircle(destination(C, 101, 10), C, 100)).toBe(false);
  });
});

describe("boundsOf", () => {
  it("returns west-south / east-north", () => {
    expect(boundsOf(SQUARE)).toEqual([
      [72.4941, 23.0785],
      [72.5039, 23.0875],
    ]);
    expect(boundsOf([])).toBeNull();
  });
});

describe("parseAreaGeoJson", () => {
  it("reads a Polygon and drops the closing point", () => {
    const json = JSON.stringify({ type: "Polygon", coordinates: [closeRing(SQUARE)] });
    expect(parseAreaGeoJson(json)).toEqual(SQUARE);
  });
  it("reads a MultiPolygon's first ring", () => {
    const json = JSON.stringify({ type: "MultiPolygon", coordinates: [[closeRing(SQUARE)]] });
    expect(parseAreaGeoJson(json)).toHaveLength(4);
  });
  it("returns nothing for null or broken JSON", () => {
    expect(parseAreaGeoJson(null)).toEqual([]);
    expect(parseAreaGeoJson("{")).toEqual([]);
  });
});
