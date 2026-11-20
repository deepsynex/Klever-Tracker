import { describe, expect, it } from "vitest";
import {
  addTyre,
  initialPlan,
  isNewTyre,
  planPositions,
  planRemovals,
  putBack,
  removedTyres,
  removeTyre,
  swapTyres,
  type RotationPlan,
} from "./rotation-plan";

const order = ["FR", "FL", "D1LO", "SP1"];
const start = initialPlan([
  { code: "FR", hasTyre: true },
  { code: "FL", hasTyre: true },
  { code: "D1LO", hasTyre: true },
  { code: "SP1", hasTyre: false },
]);
const order4 = ["FL", "D1LO", "D1LI"];
const start4 = initialPlan(order4.map((code) => ({ code, hasTyre: true })));

describe("rotation plan", () => {
  it("starts with each tyre on its own position, empty where there's none", () => {
    expect(start).toEqual({ FR: "FR", FL: "FL", D1LO: "D1LO", SP1: null });
  });

  it("swaps two tyres, and moves a tyre onto an empty position", () => {
    expect(swapTyres(start, "FR", "FL")).toMatchObject({ FR: "FL", FL: "FR" });
    expect(swapTyres(start, "D1LO", "SP1")).toMatchObject({ D1LO: null, SP1: "D1LO" });
    expect(swapTyres(start, "FR", "FR")).toBe(start);
    expect(swapTyres(start, "FR", "XX")).toBe(start);
  });

  it("takes a tyre off and lists it as removed", () => {
    const plan = removeTyre(start, "FL");
    expect(plan.FL).toBeNull();
    expect(removedTyres(plan, start, order)).toEqual(["FL"]);
    expect(removeTyre(plan, "FL")).toBe(plan);
  });

  it("puts a removed tyre back on its own position, else the first empty one", () => {
    const off = removeTyre(start, "FL");
    expect(putBack(off, "FL", order).FL).toBe("FL");
    const taken = swapTyres(off, "FR", "FL"); // FR's tyre now sits on FL.
    expect(putBack(taken, "FL", order).FR).toBe("FL");
    expect(putBack(start, "FR", order)).toBe(start);
  });

  it("adds a new tyre on an empty position only, each with its own id", () => {
    const one = addTyre(start, "SP1");
    expect(one.SP1).toBe("new:1");
    expect(isNewTyre(one.SP1!)).toBe(true);
    expect(addTyre(one, "SP1")).toBe(one);
    expect(addTyre(start, "FR")).toBe(start);
    const two = addTyre(removeTyre(one, "FR"), "FR");
    expect(two.FR).toBe("new:2");
    expect(removedTyres(two, start, order)).toEqual(["FR"]);
  });

  it("removes only tyres taken off: moves and swaps need nothing", () => {
    const fates = { FL: { fate: "scrapped", note: "" } };
    // Swap: both keep a tyre.
    expect(planRemovals(swapTyres(start, "FR", "FL"), start, order, {})).toEqual([]);
    // Taken off: its disposition.
    expect(planRemovals(removeTyre(start, "FL"), start, order, fates)).toEqual([
      { position: "FL", disposition: "scrapped", note: null },
    ]);
    // Moved to the empty spare: its old position just goes empty.
    expect(planRemovals(swapTyres(start, "D1LO", "SP1"), start, order, {})).toEqual([]);
    // Taken off and a new tyre in its place: a replacement (the position stays fitted).
    expect(planRemovals(addTyre(removeTyre(start, "FL"), "FL"), start, order, fates)).toEqual([
      { position: "FL", disposition: "scrapped", note: null },
    ]);
    // A new tyre added and removed again never existed for the API.
    expect(planRemovals(removeTyre(addTyre(start, "SP1"), "SP1"), start, order, {})).toEqual([]);
  });

  it("says where each moved tyre came from; a new tyre comes from nowhere (0 km)", () => {
    const at = (plan: RotationPlan) => Object.fromEntries(planPositions(plan, order).map((p) => [p.code, p]));
    // Swap: both sides.
    const swapped = at(swapTyres(start, "FR", "FL"));
    expect(swapped.FR).toEqual({ code: "FR", fitted: true, movedFrom: "FL" });
    expect(swapped.FL).toEqual({ code: "FL", fitted: true, movedFrom: "FR" });
    expect(swapped.D1LO).toEqual({ code: "D1LO", fitted: true });
    // Moved to the empty spare: the spare says where from; the old position is empty.
    const moved = at(swapTyres(start, "D1LO", "SP1"));
    expect(moved.SP1).toEqual({ code: "SP1", fitted: true, movedFrom: "D1LO" });
    expect(moved.D1LO).toEqual({ code: "D1LO", fitted: false });
    // The screenshot's plan: FL taken off, D1LI → FL, D1LO → D1LI, a new tyre on D1LO.
    let plan = removeTyre(start4, "FL");
    plan = swapTyres(plan, "D1LI", "FL");
    plan = swapTyres(plan, "D1LO", "D1LI");
    plan = addTyre(plan, "D1LO");
    const chain = Object.fromEntries(planPositions(plan, order4).map((p) => [p.code, p]));
    expect(chain.FL).toEqual({ code: "FL", fitted: true, movedFrom: "D1LI" });
    expect(chain.D1LI).toEqual({ code: "D1LI", fitted: true, movedFrom: "D1LO" });
    expect(chain.D1LO).toEqual({ code: "D1LO", fitted: true });
    expect(planRemovals(plan, start4, order4, {})).toEqual([{ position: "FL", disposition: "other", note: null }]);
  });
});
