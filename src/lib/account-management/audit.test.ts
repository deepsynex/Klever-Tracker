import { describe, expect, it } from "vitest";
import { auditChanges, auditSubject } from "./audit";

describe("auditChanges", () => {
  it("lists only the fields that changed", () => {
    expect(auditChanges('{"name":"Truck 1","status":"active","year":2020}', '{"name":"Truck 7","status":"active","year":null}')).toEqual([
      { field: "name", before: "Truck 1", after: "Truck 7" },
      { field: "year", before: "2020", after: "null" },
    ]);
  });

  it("handles a create (no old values), a delete (no new values) and bad JSON", () => {
    expect(auditChanges(null, '{"name":"Ops"}')).toEqual([{ field: "name", before: "", after: "Ops" }]);
    expect(auditChanges('{"name":"Ops"}', null)).toEqual([{ field: "name", before: "Ops", after: "" }]);
    expect(auditChanges("not json", null)).toEqual([{ field: "value", before: "not json", after: "" }]);
  });

  it("shortens Laravel model class names", () => {
    expect(auditSubject("App\\Models\\Vehicle")).toBe("Vehicle");
    expect(auditSubject(null)).toBe("");
  });
});
