import { describe, expect, it } from "vitest";
import { liveStatus } from "./status";

const NOW = Date.UTC(2026, 10, 13, 9, 15);
const minsAgo = (m: number) => NOW - m * 60_000;

describe("liveStatus", () => {
  it("trusts the backend: a silent tracker is offline even if its last point was moving", () => {
    expect(liveStatus("offline", 11, minsAgo(265), NOW)).toBe("offline"); // GJ-01-KY-5144, 4 h 25 m
    expect(liveStatus("moving", 40, minsAgo(1), NOW)).toBe("moving");
    expect(liveStatus("idle", 0, minsAgo(1), NOW)).toBe("idle");
    expect(liveStatus("stopped", 0, minsAgo(1), NOW)).toBe("stopped");
  });

  it("without a backend status, goes by age and speed", () => {
    expect(liveStatus(null, 50, minsAgo(45), NOW)).toBe("offline");
    expect(liveStatus(undefined, 50, minsAgo(2), NOW)).toBe("moving");
    expect(liveStatus(null, 2, minsAgo(2), NOW)).toBe("stopped");
    expect(liveStatus(null, 2, minsAgo(2), NOW, true)).toBe("idle"); // engine on, standing still
  });

  it("no position at all is offline", () => {
    expect(liveStatus("moving", 30, null, NOW)).toBe("offline");
  });
});
