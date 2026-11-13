import { describe, expect, it } from "vitest";
import { mutationAuditEntries, snakeCase, subjectOf } from "./mutation-audit";

describe("names", () => {
  it("turns a mutation name into an action and a record type", () => {
    expect(snakeCase("updateAlertRule")).toBe("update_alert_rule");
    expect(subjectOf("createGeofenceVehicleGroup")).toBe("GeofenceVehicleGroup");
    expect(subjectOf("changePassword")).toBe("Password");
    expect(subjectOf("ping")).toBeNull();
  });
});

describe("mutationAuditEntries", () => {
  it("records an update with its id, values and company", () => {
    const entries = mutationAuditEntries(
      "mutation UpdateAlertRule($id: ID!, $isActive: Boolean, $companyId: ID) { updateAlertRule(id: $id, isActive: $isActive, companyId: $companyId) { id } }",
      { id: "18", isActive: true, companyId: "1" },
      { updateAlertRule: { id: "18" } },
    );
    expect(entries).toEqual([
      { action: "update_alert_rule", auditableType: "AlertRule", auditableId: "18", newValues: '{"id":"18","isActive":true,"companyId":"1"}', companyId: "1" },
    ]);
  });

  it("takes a created record's id from the result, and reads inline values and objects", () => {
    const [entry] = mutationAuditEntries(
      'mutation { createGeofence(companyId: 1, name: "Depot", centre: { lat: 25.07, lng: 55.14 }) { id } }',
      {},
      { createGeofence: { id: "9" } },
    );
    expect(entry).toMatchObject({ action: "create_geofence", auditableId: "9", companyId: "1" });
    expect(JSON.parse(entry.newValues!)).toEqual({ companyId: 1, name: "Depot", centre: { lat: 25.07, lng: 55.14 } });
  });

  it("masks passwords, tokens and keys", () => {
    const [entry] = mutationAuditEntries(
      "mutation($p: String!) { createUser(name: \"A\", password: $p) { id } updatePlatformSettings(maptilerApiKey: \"abc\") { mapProvider } }",
      { p: "Secret123" },
      { createUser: { id: "5" }, updatePlatformSettings: { mapProvider: "osm" } },
    ).slice(0, 1);
    expect(entry.newValues).toBe('{"name":"A","password":"[set]"}');
    const settings = mutationAuditEntries('mutation { updatePlatformSettings(maptilerApiKey: "abc") { mapProvider } }', {}, { updatePlatformSettings: { mapProvider: "osm" } });
    expect(settings[0].newValues).toBe('{"maptilerApiKey":"[set]"}');
  });

  it("skips queries, sign-in, uploads, the audit write itself, and failed fields", () => {
    expect(mutationAuditEntries("query { me { id } }", {}, { me: { id: "1" } })).toEqual([]);
    expect(mutationAuditEntries('mutation { login(email: "a", password: "b") { token } }', {}, { login: { token: "x" } })).toEqual([]);
    expect(mutationAuditEntries('mutation { createAuditLog(action: "x") { id } }', {}, { createAuditLog: { id: "1" } })).toEqual([]);
    expect(mutationAuditEntries("mutation { deleteGeofence(id: 3) { id } }", {}, { deleteGeofence: null })).toEqual([]);
  });

  it("uses the alias to find the result, and the named operation in a multi-operation document", () => {
    const entries = mutationAuditEntries(
      "query Q { me { id } } mutation M { gone: deleteGeofence(id: 3) { id } }",
      {},
      { gone: { id: "3" } },
      "M",
    );
    expect(entries).toMatchObject([{ action: "delete_geofence", auditableType: "Geofence", auditableId: "3" }]);
  });
});
