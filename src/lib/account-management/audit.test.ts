import { describe, expect, it } from "vitest";
import { auditChanges, auditSubject, groupAuditEntries, nameFromValues, subjectLabel } from "./audit";

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

describe("groupAuditEntries", () => {
  const at = (s: string) => Date.parse(s.replace(" ", "T") + "Z");
  const e = (id: string, createdAt: string, userId = "32", companyId: string | null = "1") => ({ id, createdAt, userId, companyId });

  it("puts one save's entries (same user and company, seconds apart) in one row", () => {
    const groups = groupAuditEntries(
      [
        e("4", "2026-11-13 11:23:09"), // rule #19
        e("3", "2026-11-13 11:23:09"), // rule #18, same save
        e("2", "2026-11-13 11:22:47"), // 22 s earlier: a separate change
        e("1", "2026-11-05 10:39:34", "32", null),
      ],
      at,
    );
    expect(groups.map((g) => g.map((x) => x.id))).toEqual([["4", "3"], ["2"], ["1"]]);
  });

  it("keeps different users and companies apart even at the same moment", () => {
    const groups = groupAuditEntries([e("3", "2026-11-13 11:23:09"), e("2", "2026-11-13 11:23:09", "7"), e("1", "2026-11-13 11:23:09", "7", "2")], at);
    expect(groups).toHaveLength(3);
  });
});

describe("record labels", () => {
  it("turns a record type into words", () => {
    expect(subjectLabel("AlertRule")).toBe("Alert rule");
    expect(subjectLabel("App\\Models\\PlatformSettings")).toBe("Platform settings");
    expect(subjectLabel(null)).toBe("");
  });

  it("finds a name in the entry's values, new ones first", () => {
    expect(nameFromValues('{"name":"Depot","radiusM":300}', null)).toBe("Depot");
    expect(nameFromValues(null, '{"plateNo":"GJ-01-KY-5144"}')).toBe("GJ-01-KY-5144");
    expect(nameFromValues('{"isActive":true}', null)).toBeNull();
  });
});
