import { describe, expect, it } from "vitest";
import { deriveIgnitionEvents, fromAlertEvents, mergeTripEvents, nearestFixIndex, parseEventParameters } from "./trip-events";

const TYPES = [
  { id: "2", name: "Overspeed", code: "overspeed" },
  { id: "3", name: "Ignition On", code: "ignition_on" },
  { id: "4", name: "Ignition Off", code: "ignition_off" },
];

/** A fix `s` seconds after 2026-11-03 10:00:00 UTC. */
function fix(s: number, ignition: boolean | null, speed = 0) {
  const d = new Date(Date.UTC(2026, 10, 3, 10, 0, 0) + s * 1000);
  return {
    recordedAt: d.toISOString().slice(0, 19).replace("T", " "),
    locationLat: 23.1,
    locationLng: 72.5,
    speed,
    ignition,
  };
}

describe("deriveIgnitionEvents", () => {
  it("finds an on and an off that each hold for 45 s", () => {
    const fixes = [fix(0, false), fix(30, false), fix(60, true, 5), fix(80, true, 20), fix(120, true, 40), fix(400, false), fix(430, false), fix(460, false)];
    const events = deriveIgnitionEvents(fixes, TYPES);
    expect(events.map((e) => [e.code, e.occurredAt, e.eventTypeId])).toEqual([
      ["ignition_on", "2026-11-03 10:01:00", "3"],
      ["ignition_off", "2026-11-03 10:06:40", "4"],
    ]);
    expect(events[0].source).toBe("track");
  });

  it("ignores cranking flicker shorter than 45 s", () => {
    const fixes = [fix(0, false), fix(10, true), fix(15, false), fix(60, false), fix(120, false)];
    expect(deriveIgnitionEvents(fixes)).toEqual([]);
  });

  it("skips fixes with no ignition reading instead of reading them as off", () => {
    const fixes = [fix(0, true, 50), fix(20, null, 55), fix(40, true, 58), fix(60, null, 60), fix(80, true, 60)];
    expect(deriveIgnitionEvents(fixes)).toEqual([]);
  });

  it("confirms a change still held when the window ends", () => {
    const fixes = [fix(0, true, 30), fix(100, false), fix(110, false)];
    expect(deriveIgnitionEvents(fixes).map((e) => e.code)).toEqual(["ignition_off"]);
  });

  it("gives no event for the state the window starts in", () => {
    expect(deriveIgnitionEvents([fix(0, true), fix(100, true)])).toEqual([]);
  });
});

describe("parseEventParameters", () => {
  it("reads the backend's parameter JSON", () => {
    expect(parseEventParameters('{"lat":23.1,"lng":72.5,"speed":12,"odometer_m":5,"external_voltage_mv":14080}')).toEqual({
      lat: 23.1,
      lng: 72.5,
      speed: 12,
      externalVoltageMv: 14080,
    });
  });

  it("treats missing, broken or 0,0 locations as unknown", () => {
    expect(parseEventParameters(null).lat).toBeNull();
    expect(parseEventParameters("not json").lat).toBeNull();
    expect(parseEventParameters('{"lat":0,"lng":0}').lng).toBeNull();
  });
});

describe("mergeTripEvents", () => {
  const api = fromAlertEvents(
    [{ id: "9", eventTypeId: "2", vehicleId: "1", occurredAt: "2026-11-03 10:05:00", parameters: '{"lat":1,"lng":2}' }],
    TYPES,
  );
  const derived = deriveIgnitionEvents([fix(0, false), fix(60, true), fix(120, true)], TYPES);

  it("adds track ignition events when the backend has none, oldest first", () => {
    expect(mergeTripEvents(api, derived).map((e) => e.code)).toEqual(["ignition_on", "overspeed"]);
  });

  it("uses only the backend's ignition events when it has any", () => {
    const apiIgnition = fromAlertEvents([{ id: "10", eventTypeId: "3", vehicleId: "1", occurredAt: "2026-11-03 10:00:30" }], TYPES);
    const merged = mergeTripEvents([...api, ...apiIgnition], derived);
    expect(merged.every((e) => e.source === "api")).toBe(true);
    expect(merged).toHaveLength(2);
  });
});

describe("nearestFixIndex", () => {
  it("returns the closest fix in time", () => {
    const fixes = [fix(0, true), fix(60, true), fix(120, true)];
    expect(nearestFixIndex(fixes, "2026-11-03 10:01:10")).toBe(1);
    expect(nearestFixIndex([], "2026-11-03 10:01:10")).toBe(-1);
  });
});
