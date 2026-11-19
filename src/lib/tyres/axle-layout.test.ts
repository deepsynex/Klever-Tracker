import { describe, expect, it } from "vitest";
import type { AxlePosition } from "@/lib/graphql/tyres";
import { axleRows, axleSizeSlots, isTrailer, SPARE_AXLE, spareCodes } from "./axle-layout";

const p = (
  code: string,
  axleNo: number,
  side: "left" | "right",
  placement: AxlePosition["placement"],
  sortOrder: number,
): AxlePosition => ({
  code,
  axleNo,
  side,
  placement,
  sortOrder,
});

// 6x4 as the API returns it (right before left on the steer axle).
const SIX_BY_FOUR = [
  p("FR", 1, "right", "single", 1),
  p("FL", 1, "left", "single", 2),
  p("D1LO", 2, "left", "outer", 3),
  p("D1LI", 2, "left", "inner", 4),
  p("D1RI", 2, "right", "inner", 5),
  p("D1RO", 2, "right", "outer", 6),
  p("D2LO", 3, "left", "outer", 7),
  p("D2LI", 3, "left", "inner", 8),
  p("D2RI", 3, "right", "inner", 9),
  p("D2RO", 3, "right", "outer", 10),
];

describe("axleRows", () => {
  it("puts axles front first, each tyre left to right as seen from above", () => {
    const rows = axleRows(SIX_BY_FOUR);
    expect(rows.map((r) => [r.kind, r.kindNo])).toEqual([
      ["steer", 1],
      ["drive", 1],
      ["drive", 2],
    ]);
    expect(rows[0]!.left.map((t) => t.code)).toEqual(["FL"]);
    expect(rows[0]!.right.map((t) => t.code)).toEqual(["FR"]);
    // Left outer → inner, then right inner → outer.
    expect([...rows[1]!.left, ...rows[1]!.right].map((t) => t.code)).toEqual(["D1LO", "D1LI", "D1RI", "D1RO"]);
    expect(isTrailer(rows)).toBe(false);
  });

  it("recognises a trailer (every axle T…)", () => {
    const rows = axleRows([
      p("T1LO", 1, "left", "outer", 1),
      p("T1RO", 1, "right", "outer", 2),
      p("T2LO", 2, "left", "outer", 3),
    ]);
    expect(rows.map((r) => [r.kind, r.kindNo])).toEqual([
      ["trailer", 1],
      ["trailer", 2],
    ]);
    expect(isTrailer(rows)).toBe(true);
  });
});

describe("tyre size per axle", () => {
  it("asks for one size per axle (with its tyre count), plus one for the spares", () => {
    expect(axleSizeSlots(SIX_BY_FOUR, 2).map((s) => [s.axleNo, s.kind, s.tyres])).toEqual([
      [1, "steer", 2],
      [2, "drive", 4],
      [3, "drive", 4],
      [SPARE_AXLE, "spare", 2],
    ]);
  });

  it("has no spare slot when the vehicle carries none", () => {
    expect(axleSizeSlots(SIX_BY_FOUR, 0).some((s) => s.kind === "spare")).toBe(false);
    expect(spareCodes(3)).toEqual(["SP1", "SP2", "SP3"]);
    expect(spareCodes(0)).toEqual([]);
  });
});
