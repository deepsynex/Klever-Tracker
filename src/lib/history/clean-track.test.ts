import { describe, expect, it } from "vitest";
import { cleanTrack, effectiveIgnition, type TrackFix } from "./clean-track";
import { metres } from "./road-path";

const T0 = Date.UTC(2026, 10, 1, 20, 0, 0);
const SPOT = { lat: 23.081878, lng: 72.498758 };
const iso = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);

type Fix = TrackFix & { tag?: string };
const fix = (min: number, lat: number, lng: number, speed: number, ignition: boolean | null = false, tag?: string): Fix => ({
  recordedAt: iso(T0 + min * 60_000),
  locationLat: lat,
  locationLng: lng,
  speed,
  ignition,
  tag,
});

/** Deterministic drift around SPOT: mostly within ~40 m, with noisy speeds like the real tracker. */
function parked(fromMin: number, minutes: number): Fix[] {
  return Array.from({ length: minutes }, (_, k) => {
    const a = k * 2.399; // golden-angle scatter
    const r = (k % 7) * 0.00006; // up to ~40 m
    return fix(fromMin + k, SPOT.lat + r * Math.sin(a), SPOT.lng + r * Math.cos(a), k % 5 === 0 ? 12 : 0, false);
  });
}

/** Driving north-east from SPOT at ~40 km/h, a fix every minute (~670 m apart). */
function drive(fromMin: number, n: number, tag = "drive"): Fix[] {
  return Array.from({ length: n }, (_, k) =>
    fix(fromMin + k, SPOT.lat + 0.004 * (k + 1), SPOT.lng + 0.004 * (k + 1), 40, true, tag),
  );
}

const len = (ps: TrackFix[]) =>
  ps.slice(1).reduce((s, p, k) => s + metres({ lat: ps[k].locationLat!, lng: ps[k].locationLng! }, { lat: p.locationLat!, lng: p.locationLng! }), 0);

describe("cleanTrack", () => {
  it("collapses a long park into one stop at its median spot", () => {
    const raw = [...parked(0, 120), ...drive(120, 5)];
    const r = cleanTrack(raw);
    expect(r.stops).toHaveLength(1);
    expect(metres(r.stops[0], SPOT)).toBeLessThan(15);
    expect(r.points.filter((p) => p.tag === "drive")).toHaveLength(5); // the trip is untouched
    // The parked zig-zag (kilometres of fake line) is gone; only the trip remains.
    expect(len(raw) - len(r.points)).toBeGreaterThan(0.9 * len(parked(0, 120)));
  });

  it("keeps the stop's arrival and departure so playback waits there for its real duration", () => {
    const r = cleanTrack([...parked(0, 30), ...drive(30, 3)]);
    expect(r.points[0]).toMatchObject({ recordedAt: iso(T0), speed: 0 });
    expect(r.points[1]).toMatchObject({ recordedAt: iso(T0 + 29 * 60_000), speed: 0 });
    expect(r.points[1].locationLat).toBe(r.points[0].locationLat);
  });

  it("drops a single drift spike far from the spot", () => {
    const raw = parked(0, 40);
    raw[20] = { ...raw[20], locationLat: SPOT.lat + 0.002 }; // 220 m away for one fix
    const r = cleanTrack(raw);
    expect(r.stops).toHaveLength(1);
    expect(r.points).toHaveLength(2);
  });

  it("merges a still drift excursion (195 m away for 5 min, speed 0, ignition off) into the stop", () => {
    const away = Array.from({ length: 6 }, (_, k) => fix(60 + k, SPOT.lat + 0.00175, SPOT.lng + 0.0001, 0, false));
    const raw = [...parked(0, 60), ...away, ...parked(66, 60)];
    const r = cleanTrack(raw);
    expect(r.stops).toHaveLength(1);
    expect(r.stops[0].start).toBe(iso(T0));
    expect(r.stops[0].end).toBe(iso(T0 + 125 * 60_000));
  });

  it("keeps a real short move between two parking spots (ignition on, real speed)", () => {
    const moved = { lat: SPOT.lat + 0.01, lng: SPOT.lng }; // ~1.1 km away
    const second = parked(0, 20).map((p) => ({
      ...p,
      recordedAt: iso(Date.parse(p.recordedAt.replace(" ", "T") + "Z") + 22 * 60_000),
      locationLat: p.locationLat! - SPOT.lat + moved.lat,
    }));
    const raw = [...parked(0, 20), fix(20, SPOT.lat + 0.005, SPOT.lng, 35, true, "move"), fix(21, SPOT.lat + 0.009, SPOT.lng, 30, true, "move"), ...second];
    const r = cleanTrack(raw);
    expect(r.stops).toHaveLength(2);
    expect(r.points.filter((p) => p.tag === "move")).toHaveLength(2);
  });

  it("draws the pull-out of a parking spot instead of jumping from the spot's centre", () => {
    // Last parked minute: already rolling out with the ignition on, 60 m from the spot.
    const raw = [...parked(0, 30), fix(30, SPOT.lat - 0.00055, SPOT.lng, 15, true, "pullout"), ...drive(31, 3)];
    const r = cleanTrack(raw);
    expect(r.points.some((p) => p.tag === "pullout")).toBe(true);
  });

  it("ignores ignition-off heartbeats while driving (they are not stops)", () => {
    const trip = drive(0, 10).map((p, k) => (k % 2 ? { ...p, ignition: false } : p));
    const r = cleanTrack(trip);
    expect(r.stops).toHaveLength(0);
    expect(r.points).toHaveLength(10);
  });

  it("does not turn a short wait (under 3 minutes) into a stop", () => {
    const wait = [fix(5, SPOT.lat, SPOT.lng, 0, true), fix(6, SPOT.lat, SPOT.lng, 0, true)];
    const r = cleanTrack([...drive(0, 5), ...wait, ...drive(7, 3, "after")]);
    expect(r.stops).toHaveLength(0);
  });
});

describe("effectiveIgnition", () => {
  it("fills missing readings with the last known state, and the start with the first one", () => {
    const pts = [null, false, null, true, null, null].map((ignition) => ({ ignition }));
    expect(effectiveIgnition(pts)).toEqual([false, false, false, true, true, true]);
  });

  it("stays unknown when the window has no reading at all", () => {
    expect(effectiveIgnition([{ ignition: null }, { ignition: undefined }])).toEqual([null, null]);
  });
});

describe("cleanTrack with no-reading beacon records", () => {
  it("keeps a parked night a stop when beacon records (no ignition reading) carry drift speeds", () => {
    // A parked night with the ignition off, where every other record is a beacon record with no
    // ignition reading and a GPS-drift speed: before, these counted as driving.
    const night = parked(0, 180).map((p, k) => (k % 2 ? { ...p, ignition: null, speed: 8 } : p));
    const r = cleanTrack([...night, ...drive(180, 5)]);
    expect(r.stops).toHaveLength(1);
    expect(r.stops[0].start).toBe(night[0].recordedAt);
  });
});
