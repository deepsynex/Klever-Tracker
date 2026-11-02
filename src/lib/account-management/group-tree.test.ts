import { describe, expect, it } from "vitest";
import { groupTree } from "./group-tree";

const g = (id: string, name: string, parentId: string | null = null) => ({ id, name, parentId });

describe("groupTree", () => {
  it("lists parents before their children, sorted by name, with depth", () => {
    const tree = groupTree([g("3", "Vans", "1"), g("1", "Dubai"), g("2", "Abu Dhabi"), g("4", "Trucks", "1")]);
    expect(tree.map((x) => `${"-".repeat(x.depth)}${x.group.name}`)).toEqual(["Abu Dhabi", "Dubai", "-Trucks", "-Vans"]);
  });

  it("treats a group whose parent isn't listed as top level, and survives a parent cycle", () => {
    expect(groupTree([g("5", "Orphan", "99")]).map((x) => x.depth)).toEqual([0]);
    expect(groupTree([g("1", "A", "2"), g("2", "B", "1")]).map((x) => x.group.name).sort()).toEqual(["A", "B"]);
  });
});
