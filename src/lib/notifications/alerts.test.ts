import { describe, expect, it } from "vitest";
import { notificationKind } from "./api";
import { alertToNotification, isOpenAlert, newestFirst } from "./alerts";

const types = new Map([
  ["7", { name: "Geofence Enter", code: "geofence_enter" }],
  ["2", { name: "Overspeed", code: "overspeed" }],
]);
const plates = new Map([["1", "GJ-01-KY-5144"]]);

describe("alertToNotification", () => {
  it("turns a geofence alert into an 'entered' row with its geofence and vehicle", () => {
    const n = alertToNotification(
      { id: "9", eventTypeId: "7", vehicleId: "1", occurredAt: "2026-11-12 06:00:00", parameters: '{"geofence_id":3,"geofence_name":"Depot","lat":23.1,"lng":72.5}' },
      types,
      plates,
    );
    expect(n.id).toBe("alert-9");
    expect(n.readAt).toBeNull();
    expect(notificationKind(n)).toBe("enter");
    expect(n.details).toMatchObject({ vehicleId: "1", plateNo: "GJ-01-KY-5144", geofenceId: "3", geofenceName: "Depot", lat: 23.1 });
  });

  it("finds the geofence's name when the engine stored only its id", () => {
    const n = alertToNotification(
      { id: "29", eventTypeId: "7", vehicleId: "1", occurredAt: "2026-11-13 06:08:39", parameters: '{"geofence_id": 8}' },
      types,
      plates,
      new Map([["8", "TEST QA – Dubai Marina depot"]]),
    );
    expect(n.details).toMatchObject({ geofenceId: "8", geofenceName: "TEST QA – Dubai Marina depot" });
  });

  it("uses the event type name as the title for other alerts, and counts acknowledged ones as read", () => {
    const n = alertToNotification(
      { id: "10", eventTypeId: "2", vehicleId: "1", occurredAt: "2026-11-12 06:00:00", acknowledgedAt: "2026-11-12 06:05:00" },
      types,
      plates,
    );
    expect(n.title).toBe("Overspeed");
    expect(n.body).toBe("GJ-01-KY-5144");
    expect(n.readAt).toBe("2026-11-12 06:05:00");
    expect(notificationKind(n)).toBe("other");
  });

  it("copes with unknown types, unknown vehicles and broken parameters", () => {
    const n = alertToNotification({ id: "11", eventTypeId: "99", vehicleId: "5", occurredAt: "x", parameters: "nope" }, types, plates);
    expect(n.title).toBe("");
    expect(n.details.plateNo).toBeNull();
    expect(n.details.vehicleId).toBe("5");
  });
});

describe("helpers", () => {
  it("knows which alerts are still open", () => {
    expect(isOpenAlert({ acknowledgedAt: null, resolvedAt: null })).toBe(true);
    expect(isOpenAlert({ acknowledgedAt: "2026-11-12 06:00:00", resolvedAt: null })).toBe(false);
    expect(isOpenAlert({ acknowledgedAt: null, resolvedAt: "2026-11-12 06:00:00" })).toBe(false);
  });

  it("sorts newest first", () => {
    expect(newestFirst([{ createdAt: "2026-11-12 05:00:00" }, { createdAt: "2026-11-12 07:00:00" }]).map((x) => x.createdAt)).toEqual([
      "2026-11-12 07:00:00",
      "2026-11-12 05:00:00",
    ]);
  });
});
