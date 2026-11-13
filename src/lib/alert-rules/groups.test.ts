import { describe, expect, it } from "vitest";
import type { AlertRule } from "@/lib/graphql/alert-rules";
import { groupRules, planRowSave, rowAlerts, rowSettingsDiffer, targetKey } from "./groups";

const rule = (id: string, over: Partial<AlertRule> = {}): AlertRule => ({
  id,
  companyId: "1",
  eventTypeId: "7",
  name: `Rule ${id}`,
  description: null,
  isActive: true,
  vehicleId: null,
  vehicleGroupId: null,
  notifyInApp: true,
  notifyPush: false,
  notifyEmail: true,
  emailSubject: null,
  emailMessage: null,
  minRepeatIntervalMinutes: null,
  recipients: [],
  ...over,
});

describe("groupRules", () => {
  it("makes one row per company and vehicle, group or whole company", () => {
    const rows = groupRules([
      rule("1", { vehicleId: "16", eventTypeId: "7" }),
      rule("2", { vehicleId: "16", eventTypeId: "8" }),
      rule("3", { vehicleId: "1", eventTypeId: "7" }),
      rule("4", { vehicleGroupId: "3" }),
      rule("5", {}),
      rule("6", { companyId: "2" }),
    ]);
    expect(rows.map((r) => [r.key, r.rules.map((x) => x.id)])).toEqual([
      ["1|v16", ["1", "2"]],
      ["1|v1", ["3"]],
      ["1|g3", ["4"]],
      ["1|all", ["5"]],
      ["2|all", ["6"]],
    ]);
    expect(rowAlerts(rows[0])).toEqual(["7", "8"]);
    expect(targetKey({ companyId: "1", vehicleId: "16", vehicleGroupId: null })).toBe("1|v16");
  });
});

describe("planRowSave", () => {
  it("updates kept alerts, creates new ones, deletes unticked alerts and duplicates", () => {
    const existing = [rule("1", { eventTypeId: "7" }), rule("2", { eventTypeId: "8" }), rule("3", { eventTypeId: "7" })];
    const plan = planRowSave(existing, ["7", "2"]);
    expect(plan.update.map((r) => r.id)).toEqual(["1"]);
    expect(plan.create).toEqual(["2"]);
    expect(plan.remove.sort()).toEqual(["2", "3"]);
  });

  it("creates everything for a new row", () => {
    expect(planRowSave([], ["7", "8"])).toEqual({ update: [], create: ["7", "8"], remove: [] });
  });
});

describe("rowSettingsDiffer", () => {
  it("is true only when the rules notify differently", () => {
    const same = groupRules([rule("1", { eventTypeId: "7" }), rule("2", { eventTypeId: "8" })])[0];
    expect(rowSettingsDiffer(same)).toBe(false);
    const differ = groupRules([rule("1"), rule("2", { notifyPush: true })])[0];
    expect(rowSettingsDiffer(differ)).toBe(true);
  });
});
