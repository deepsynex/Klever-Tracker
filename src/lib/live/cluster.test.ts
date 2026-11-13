import { describe, expect, it } from "vitest";
import { clusterPoints, NO_CLUSTER_ZOOM, toPixels, type ClusterPoint } from "./cluster";

const v = (id: string, lat: number, lng: number, status: ClusterPoint["status"] = "moving"): ClusterPoint => ({ id, lat, lng, status });
// Dubai Marina, Deira (~25 km away) and Abu Dhabi (~120 km).
const fleet = [v("a", 25.077, 55.141), v("b", 25.078, 55.142, "stopped"), v("c", 25.27, 55.31, "offline"), v("d", 24.45, 54.38)];

describe("toPixels", () => {
  it("doubles distances with every zoom level", () => {
    const a = toPixels(25, 55, 10);
    const b = toPixels(25, 55, 11);
    expect(b.x / a.x).toBeCloseTo(2, 6);
  });
});

describe("clusterPoints", () => {
  it("merges vehicles that would overlap, with a count per status", () => {
    const out = clusterPoints(fleet, 8);
    const cluster = out.find((c) => c.kind === "cluster");
    expect(cluster && cluster.kind === "cluster" && cluster.points.map((p) => p.id).sort()).toEqual(["a", "b", "c"]);
    expect(cluster && cluster.kind === "cluster" && cluster.counts).toEqual({ moving: 1, idle: 0, stopped: 1, offline: 1 });
    expect(out.filter((c) => c.kind === "single").map((c) => c.kind === "single" && c.point.id)).toEqual(["d"]);
  });

  it("splits groups as you zoom in, and never merges at street level", () => {
    expect(clusterPoints(fleet, 12).filter((c) => c.kind === "cluster")).toHaveLength(1); // a + b only
    expect(clusterPoints(fleet, NO_CLUSTER_ZOOM).every((c) => c.kind === "single")).toBe(true);
  });

  it("keeps the followed vehicle on its own", () => {
    const out = clusterPoints(fleet, 8, "a");
    expect(out.some((c) => c.kind === "single" && c.point.id === "a")).toBe(true);
    const cluster = out.find((c) => c.kind === "cluster");
    expect(cluster && cluster.kind === "cluster" && cluster.points.map((p) => p.id).sort()).toEqual(["b", "c"]);
  });
});
