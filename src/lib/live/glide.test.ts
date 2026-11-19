import { describe, expect, it } from "vitest";
import { glidePosition, startGlide } from "./glide";

const A = { lat: 25.2, lng: 55.27 };
const B = { lat: 25.201, lng: 55.27 }; // ~111 m north of A

describe("live glide", () => {
  it("places a vehicle seen for the first time straight away", () => {
    const g = startGlide(null, A, 90, null, 30_000, 0);
    expect(g.duration).toBe(0);
    expect(glidePosition(g, 0)).toEqual({ ...A, done: true });
    expect(g.heading).toBe(90);
  });

  it("glides to a new fix over the given time, pointing the way it moves", () => {
    const g = startGlide(A, B, 200, null, 10_000, 1000);
    expect(g.duration).toBe(10_000);
    expect(Math.round(g.heading!)).toBe(0); // due north, not the device's 200°
    const half = glidePosition(g, 6000);
    expect(half.done).toBe(false);
    expect(half.lat).toBeCloseTo((A.lat + B.lat) / 2, 6);
    expect(glidePosition(g, 11_000)).toEqual({ ...B, done: true });
  });

  it("jumps instead of gliding across a GPS gap (over 2 km) or with reduced motion", () => {
    expect(startGlide(A, { lat: 25.3, lng: 55.27 }, null, null, 10_000, 0).duration).toBe(0);
    expect(startGlide(A, B, null, null, 10_000, 0, true).duration).toBe(0);
  });

  it("keeps the device heading when standing still", () => {
    const g = startGlide(A, A, 45, 10, 10_000, 0);
    expect(g.duration).toBe(0);
    expect(g.heading).toBe(45);
    expect(startGlide(A, A, null, 10, 10_000, 0).heading).toBe(10);
  });
});
