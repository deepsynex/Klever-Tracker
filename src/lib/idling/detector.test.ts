import { describe, expect, it } from "vitest";
import { currentIdle, excessiveIdle, formatIdle, type IdleFix } from "./detector";

const T0 = Date.UTC(2026, 10, 13, 8, 0, 0);
const at = (seconds: number) => T0 + seconds * 1000;
const fix = (seconds: number, speed: number, ignition: boolean | null = true, lat = 25.0772, lng = 55.1409): IdleFix => ({ at: at(seconds), ignition, speed, lat, lng });
/** One point every `every` seconds from `from` to `to`. */
const idleRun = (from: number, to: number, every = 30, speed = 0) => Array.from({ length: Math.floor((to - from) / every) + 1 }, (_, i) => fix(from + i * every, speed));

describe("excessiveIdle", () => {
  it("a 2-minute stop at a traffic light raises nothing", () => {
    const fixes = [fix(0, 40), ...idleRun(30, 150), fix(180, 35, true, 25.08, 55.141)];
    expect(excessiveIdle(fixes, at(190))).toBeNull();
    // Even while still at the light, 2 minutes is under the 10-minute threshold.
    expect(excessiveIdle([fix(0, 40), ...idleRun(30, 150)], at(150))).toBeNull();
  });

  it("a 15-minute idle is listed once, from the first idle point", () => {
    const fixes = [fix(0, 30), ...idleRun(60, 15 * 60 + 60)];
    const idle = excessiveIdle(fixes, at(15 * 60 + 60));
    expect(idle).toMatchObject({ since: at(60), seconds: 15 * 60, atLeast: false });
    // One episode: the start doesn't move while it continues.
    expect(excessiveIdle([...fixes, fix(16 * 60 + 60, 0)], at(16 * 60 + 60))?.since).toBe(at(60));
  });

  it("GPS drift of 2–4 km/h while stopped still counts as idle", () => {
    const fixes = [fix(0, 0), ...Array.from({ length: 30 }, (_, i) => fix(30 + i * 30, 2 + (i % 3)))];
    expect(excessiveIdle(fixes, at(30 * 30))?.since).toBe(at(0));
  });

  it("a 10-second creep forward doesn't reset the timer", () => {
    const fixes = [...idleRun(0, 600), fix(610, 8, true, 25.07725, 55.1409), fix(620, 7, true, 25.0773, 55.1409), ...idleRun(630, 780)];
    expect(excessiveIdle(fixes, at(780))?.since).toBe(at(0));
  });

  it("ignition OFF ends the episode, and a parked vehicle is never listed", () => {
    const fixes = [...idleRun(0, 900), fix(930, 0, false), fix(1200, 0, false)];
    expect(currentIdle(fixes)).toBeNull();
    expect(excessiveIdle(fixes, at(1210))).toBeNull();
  });

  it("driving away (30 s moving, or 50 m) ends the episode", () => {
    const moved = [...idleRun(0, 900), fix(910, 20), fix(925, 25), fix(945, 30)];
    expect(currentIdle(moved)).toBeNull();
    const far = [...idleRun(0, 900), fix(905, 15, true, 25.0781, 55.1409)]; // ~100 m north
    expect(currentIdle(far)).toBeNull();
  });

  it("a late, buffered point is ignored for the live state", () => {
    // Idling since 0; a buffered point from before (ignition off, at -600 s) arrives late.
    const fixes = [...idleRun(0, 900), fix(-600, 0, false), fix(930, 0)];
    expect(excessiveIdle(fixes, at(930))?.since).toBe(at(0));
  });

  it("a stale device (no point for 5 minutes) is left out", () => {
    const fixes = idleRun(0, 1200);
    expect(excessiveIdle(fixes, at(1200 + 4 * 60))).not.toBeNull();
    expect(excessiveIdle(fixes, at(1200 + 6 * 60))).toBeNull();
  });

  it("uses the vehicle's own threshold, and marks an idle older than the points we have", () => {
    const fixes = idleRun(0, 300);
    expect(excessiveIdle(fixes, at(300))).toBeNull();
    expect(excessiveIdle(fixes, at(300), { thresholdMinutes: 5 })).toMatchObject({ atLeast: true, seconds: 300 });
  });
});

describe("formatIdle", () => {
  it("matches the reference panel", () => {
    expect(formatIdle(44 * 60 + 22)).toBe("00 days,00:44:22");
    expect(formatIdle(2 * 86_400 + 3 * 3600 + 5)).toBe("02 days,03:00:05");
  });
});
