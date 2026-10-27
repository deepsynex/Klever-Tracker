import { afterEach, describe, expect, it, vi } from "vitest";
import {
  alignToLegs,
  bearing,
  buildPlaybackTrack,
  buildRoutesRequest,
  fetchRoadPaths,
  fetchRouteLegs,
  gpsTurnarounds,
  MAX_REQUESTS_PER_TRACK,
  parseRouteLegs,
  planStops,
  positionAt,
  RoadPathDeniedError,
  snapPointsToPath,
  splitIntoSegments,
  trimSpikes,
  type LatLng,
} from "./road-path";

// ~111 m per 0.001° of latitude; ~103 m per 0.001° of longitude at 22.55°N.
const east = (n: number, step = 0.001) => Array.from({ length: n }, (_, i) => ({ lat: 22.55, lng: 72.95 + i * step }));
const minutes = (m: number) => m * 60_000;

describe("splitIntoSegments", () => {
  it("keeps normal driving in one segment", () => {
    const fixes = east(5).map((p, i) => ({ ...p, time: minutes(i) })); // ~100 m per minute
    expect(splitIntoSegments(fixes)).toEqual([[0, 1, 2, 3, 4]]);
  });

  it("splits at a GPS glitch: 17 km in 2 seconds", () => {
    const fixes = [
      { lat: 22.548, lng: 72.925, time: 0 },
      { lat: 22.687, lng: 72.843, time: 2_000 },
      { lat: 22.6871, lng: 72.843, time: 4_000 },
    ];
    expect(splitIntoSegments(fixes)).toEqual([[0], [1, 2]]);
  });

  it("splits at a long gap in the data even when the speed is plausible", () => {
    const fixes = [
      { lat: 22.548, lng: 72.925, time: 0 },
      { lat: 22.687, lng: 72.843, time: minutes(11) }, // 17 km in 11 min, nothing in between
    ];
    expect(splitIntoSegments(fixes)).toEqual([[0], [1]]);
  });
});

describe("planStops", () => {
  it("keeps the first and last fix and spaces the rest about 100 m apart", () => {
    const stops = planStops(east(11, 0.0003)); // ~31 m apart, ~310 m in total
    expect(stops[0]).toBe(0);
    expect(stops[stops.length - 1]).toBe(10);
    expect(stops).toEqual([0, 4, 8, 10]);
  });

  it("returns a single stop for a parked vehicle", () => {
    expect(planStops(Array.from({ length: 5 }, () => ({ lat: 22.55, lng: 72.95 })))).toEqual([0]);
  });
});

describe("buildRoutesRequest / parseRouteLegs", () => {
  it("routes through every stop with its heading", () => {
    const body = buildRoutesRequest(east(4), [90, 90, 90, 90]);
    expect(body.origin.location.latLng).toEqual({ latitude: 22.55, longitude: 72.95 });
    expect(body.intermediates).toHaveLength(2);
    expect(body.intermediates[0].location.heading).toBe(90);
  });

  it("returns one line per leg, or null when the leg count doesn't match the stops", () => {
    const leg = { polyline: { geoJsonLinestring: { coordinates: [[72.95, 22.55], [72.951, 22.55]] } } };
    expect(parseRouteLegs({ routes: [{ legs: [leg, leg] }] }, 3)).toEqual([
      [{ lat: 22.55, lng: 72.95 }, { lat: 22.55, lng: 72.951 }],
      [{ lat: 22.55, lng: 72.95 }, { lat: 22.55, lng: 72.951 }],
    ]);
    expect(parseRouteLegs({ routes: [{ legs: [leg] }] }, 3)).toBeNull();
    expect(parseRouteLegs({}, 2)).toBeNull();
  });
});

describe("trimSpikes", () => {
  // East along a road, a 100 m spur north and back, then on east.
  const spiked: LatLng[] = [
    { lat: 22.55, lng: 72.95 },
    { lat: 22.55, lng: 72.951 },
    { lat: 22.5509, lng: 72.951 },
    { lat: 22.55, lng: 72.951 },
    { lat: 22.55, lng: 72.952 },
  ];

  it("cuts a drive-past-and-turn-back spike the GPS never shows", () => {
    const { path, remap } = trimSpikes(spiked, []);
    expect(path.every((p) => p.lat < 22.5502)).toBe(true);
    // Distances after the spike move back by about its length (~200 m).
    expect(remap(300)).toBeLessThan(150);
  });

  it("keeps it when the GPS shows the vehicle really turned around there", () => {
    const { path } = trimSpikes(spiked, [{ lat: 22.5509, lng: 72.951 }]);
    expect(path).toEqual(spiked);
  });

  it("finds real turnarounds in the GPS", () => {
    const outAndBack = [...east(4, 0.0005), ...east(4, 0.0005).reverse().slice(1)];
    expect(gpsTurnarounds(outAndBack).length).toBeGreaterThan(0);
    expect(gpsTurnarounds(east(6, 0.0005))).toEqual([]);
  });
});

describe("alignToLegs", () => {
  it("puts each stop at the end of its leg and the fixes in between in order", () => {
    const points = east(5, 0.0005); // stops at 0, 2, 4 (~103 m apart)
    const stops = [0, 2, 4];
    const legs = [
      [points[0], points[2]],
      [points[2], points[4]],
    ];
    const road = alignToLegs(points, stops, legs);
    expect(road.along[0]).toBe(0);
    expect(road.along[2]).toBeCloseTo(road.along[4] / 2, 0);
    for (let i = 1; i < points.length; i++) expect(road.along[i]).toBeGreaterThanOrEqual(road.along[i - 1]);
  });
});

describe("snapPointsToPath", () => {
  const road = [
    { lat: 22.55, lng: 72.95 },
    { lat: 22.55, lng: 72.96 },
  ];

  it("moves off-road GPS fixes onto the road", () => {
    const snapped = snapPointsToPath(
      [
        { lat: 22.5503, lng: 72.951 },
        { lat: 22.5497, lng: 72.955 },
      ],
      road,
    );
    expect(snapped.every((p) => p.lat === 22.55)).toBe(true);
    expect(snapped[1].lng).toBeCloseTo(72.955, 6);
  });

  it("never moves the marker backwards along the road", () => {
    const snapped = snapPointsToPath(
      [
        { lat: 22.55, lng: 72.955 },
        { lat: 22.5501, lng: 72.9549 },
      ],
      road,
    );
    expect(snapped[1]).toEqual(snapped[0]);
  });
});

describe("buildPlaybackTrack / positionAt", () => {
  it("marks fixes on either side of a glitch as different segments", () => {
    const fixes = [
      { lat: 22.548, lng: 72.925, time: 0 },
      { lat: 22.5481, lng: 72.925, time: 10_000 },
      { lat: 22.687, lng: 72.843, time: 12_000 },
    ];
    const track = buildPlaybackTrack(fixes, null);
    expect(track.segmentOf).toEqual([0, 0, 1]);
    expect(positionAt(track, track.along[2])).toEqual(fixes[2]);
  });

  it("uses a segment's road line and fix distances when given", () => {
    const fixes = east(3, 0.0005);
    const track = buildPlaybackTrack(fixes, [{ path: [fixes[0], fixes[2]], along: [0, 50, 100] }]);
    expect(track.along).toEqual([0, 50, 100]);
    expect(track.path).toEqual([fixes[0], fixes[2]]);
    expect(positionAt(track, track.cumulative[1] / 2).lng).toBeCloseTo(fixes[1].lng, 6);
  });

  it("falls back to the GPS track without road lines, and clamps to the ends", () => {
    const fixes = east(2);
    const track = buildPlaybackTrack(fixes, null);
    expect(positionAt(track, track.along[1] / 2).lng).toBeCloseTo(72.9505, 6);
    expect(positionAt(track, -10)).toEqual(fixes[0]);
    expect(positionAt(track, 1e9)).toEqual(fixes[1]);
  });
});

describe("bearing", () => {
  it("points east and north correctly", () => {
    expect(bearing({ lat: 22.55, lng: 72.95 }, { lat: 22.55, lng: 72.96 })).toBeCloseTo(90, 0);
    expect(bearing({ lat: 22.55, lng: 72.95 }, { lat: 22.56, lng: 72.95 })).toBeCloseTo(0, 0);
  });
});

describe("fetching", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("throws RoadPathDeniedError when Google refuses the key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    await expect(fetchRouteLegs(east(3), [90, 90, 90], "key")).rejects.toBeInstanceOf(RoadPathDeniedError);
  });

  it("gives up for the session when the daily quota is used up", async () => {
    const quota = JSON.stringify({ error: { code: 429, details: [{ quota_limit: "ComputeRoutesRequestsPerDay" }] } });
    const fetchMock = vi.fn(async () => new Response(quota, { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchRouteLegs(east(3, 0.002), [90, 90, 90], "key")).rejects.toBeInstanceOf(RoadPathDeniedError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries when Google is rate limiting", async () => {
    vi.useFakeTimers();
    const leg = { polyline: { geoJsonLinestring: { coordinates: [[72.95, 22.55], [72.951, 22.55]] } } };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ routes: [{ legs: [leg] }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = fetchRouteLegs(east(2), [90, 90], "key");
    await vi.runAllTimersAsync();
    expect(await result).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("skips the request for fewer than two stops", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchRouteLegs(east(1), [0], "key")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps a long track within MAX_REQUESTS_PER_TRACK requests", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const legs = new Array(body.intermediates.length + 1).fill({
        polyline: { geoJsonLinestring: { coordinates: [[72.95, 22.55], [72.951, 22.55]] } },
      });
      return new Response(JSON.stringify({ routes: [{ legs }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    // ~1,000 km of driving at one fix per ~100 m.
    const long = Array.from({ length: 10_000 }, (_, i) => ({ lat: 22 + (i * 0.0009) / 10, lng: 72 + (i % 2) * 0.0009, time: i * 10_000 }));
    await fetchRoadPaths(long, "key");
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(MAX_REQUESTS_PER_TRACK);
  });

  it("routes each segment on its own and never across a glitch", async () => {
    const bodies: Array<{ origin: { location: { latLng: { latitude: number } } } }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        bodies.push(body);
        const stops = [body.origin, ...body.intermediates, body.destination];
        const legs = stops.slice(1).map((s: { location: { latLng: { latitude: number; longitude: number } } }, k: number) => ({
          polyline: {
            geoJsonLinestring: {
              coordinates: [
                [stops[k].location.latLng.longitude, stops[k].location.latLng.latitude],
                [s.location.latLng.longitude, s.location.latLng.latitude],
              ],
            },
          },
        }));
        return new Response(JSON.stringify({ routes: [{ legs }] }), { status: 200 });
      }),
    );
    const home = east(4, 0.001).map((p, i) => ({ ...p, time: minutes(i) }));
    const far = [
      { lat: 22.687, lng: 72.843, time: minutes(3) + 2_000 },
      { lat: 22.687, lng: 72.845, time: minutes(5) },
    ];
    const roads = await fetchRoadPaths([...home, ...far], "key");
    expect(roads).toHaveLength(2);
    expect(bodies).toHaveLength(2);
    expect(bodies.map((b) => b.origin.location.latLng.latitude)).toEqual([22.55, 22.687]);
  });
});
