import { describe, expect, it } from "vitest";
import { allModuleCodes, modulesForCompany, sameModules, toggleModule } from "./company-modules";

const MODULES = [{ code: "core" }, { code: "vehicles" }, { code: "live-position" }, { code: "tyres" }];

describe("company modules", () => {
  it("ticks and unticks a module, but never removes core", () => {
    expect(toggleModule(["core", "vehicles"], "tyres", true)).toEqual(["core", "tyres", "vehicles"]);
    expect(toggleModule(["core", "tyres", "vehicles"], "tyres", false)).toEqual(["core", "vehicles"]);
    expect(toggleModule(["core", "vehicles"], "core", false)).toEqual(["core", "vehicles"]);
  });

  it("offers a company's roles only the company's modules (plus core)", () => {
    expect(modulesForCompany(MODULES, ["tyres"]).map((m) => m.code)).toEqual(["core", "tyres"]);
    expect(modulesForCompany(MODULES, null)).toBe(MODULES);
  });

  it("starts a company with every module", () => {
    expect(allModuleCodes(MODULES)).toEqual(["core", "live-position", "tyres", "vehicles"]);
  });

  it("compares lists ignoring order", () => {
    expect(sameModules(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameModules(["a"], ["a", "b"])).toBe(false);
  });
});
