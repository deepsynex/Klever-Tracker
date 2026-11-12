import { describe, expect, it } from "vitest";
import { notificationKind, parseDetails, toAppNotification, urlBase64ToUint8Array } from "./api";

describe("parseDetails", () => {
  it("reads the JSON string GraphQL returns", () => {
    expect(
      parseDetails(
        '{"event_code":"geofence_enter","vehicle_id":1,"plate_no":"GJ-01-KY-5144","geofence_id":"7","geofence_name":"Warehouse","lat":23.1,"lng":72.5,"occurred_at":"2026-11-12 06:00:00"}',
      ),
    ).toEqual({
      eventCode: "geofence_enter",
      vehicleId: "1",
      plateNo: "GJ-01-KY-5144",
      geofenceId: "7",
      geofenceName: "Warehouse",
      lat: 23.1,
      lng: 72.5,
      occurredAt: "2026-11-12 06:00:00",
      speed: null,
      externalVoltageMv: null,
      address: null,
    });
  });

  it("reads the object the broadcast sends", () => {
    expect(parseDetails({ event_code: "geofence_exit", vehicle_id: "2" })).toMatchObject({ eventCode: "geofence_exit", vehicleId: "2" });
  });

  it("returns empty details for null, broken JSON and 0,0", () => {
    expect(parseDetails(null).eventCode).toBeNull();
    expect(parseDetails("not json").vehicleId).toBeNull();
    expect(parseDetails('{"lat":0,"lng":0}').lat).toBeNull();
  });
});

describe("notificationKind", () => {
  const n = (code: string | null) => toAppNotification({ id: "1", alertEventId: null, title: "", body: "", data: { event_code: code }, readAt: null, createdAt: "" });
  it("tells enter, exit and other apart", () => {
    expect(notificationKind(n("geofence_enter"))).toBe("enter");
    expect(notificationKind(n("geofence_exit"))).toBe("exit");
    expect(notificationKind(n("overspeed"))).toBe("other");
  });
});

describe("urlBase64ToUint8Array", () => {
  it("decodes base64url with missing padding", () => {
    expect(Array.from(urlBase64ToUint8Array("AQID_w"))).toEqual([1, 2, 3, 255]);
  });
});
