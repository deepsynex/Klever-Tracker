import { describe, expect, it } from "vitest";
import {
  axlesFromPositions,
  buildPositions,
  suggestCode,
  validateAxleConfiguration,
  type AxleSpec,
} from "./axle-builder";

const truck6x4: AxleSpec[] = [
  { kind: "steer", dual: false },
  { kind: "drive", dual: true },
  { kind: "drive", dual: true },
];

describe("buildPositions", () => {
  it("names positions like the standard layouts", () => {
    const p = buildPositions(truck6x4);
    expect(p.map((x) => x.code)).toEqual(["FR", "FL", "D1LO", "D1LI", "D1RI", "D1RO", "D2LO", "D2LI", "D2RI", "D2RO"]);
    expect(p[0]).toEqual({ code: "FR", axleNo: 1, side: "right", placement: "single", sortOrder: 1 });
    expect(p[2]).toEqual({ code: "D1LO", axleNo: 2, side: "left", placement: "outer", sortOrder: 3 });
    expect(p.at(-1)).toMatchObject({ code: "D2RO", axleNo: 3, sortOrder: 10 });
  });

  it("numbers a second steer axle and single-tyre drive and trailer axles", () => {
    expect(
      buildPositions([
        { kind: "steer", dual: false },
        { kind: "steer", dual: false },
        { kind: "drive", dual: false },
      ]).map((x) => x.code),
    ).toEqual(["FR", "FL", "F2R", "F2L", "D1R", "D1L"]);
    expect(buildPositions([{ kind: "trailer", dual: true }]).map((x) => x.code)).toEqual([
      "T1LO",
      "T1LI",
      "T1RI",
      "T1RO",
    ]);
  });

  it("round-trips through the axle list", () => {
    const mixed: AxleSpec[] = [
      { kind: "steer", dual: false },
      { kind: "steer", dual: false },
      { kind: "drive", dual: true },
      { kind: "drive", dual: false },
    ];
    expect(axlesFromPositions(buildPositions(mixed))).toEqual(mixed);
  });
});

describe("suggestCode", () => {
  it("counts wheel ends and driven wheel ends, or names a trailer", () => {
    expect(suggestCode(truck6x4)).toBe("6x4");
    expect(
      suggestCode([
        { kind: "trailer", dual: true },
        { kind: "trailer", dual: true },
      ]),
    ).toBe("2x_trailer");
    expect(suggestCode([])).toBe("");
  });
});

describe("validateAxleConfiguration", () => {
  const existing = [{ id: "4", code: "6x4", name: "6x4 (3 axles, tandem drive)" }];
  const ok = { code: "8x4", name: "8x4 twin steer", spareCount: "1" };
  const twinSteer: AxleSpec[] = [{ kind: "steer", dual: false }, ...truck6x4];

  it("accepts a valid layout, and its own code when editing", () => {
    expect(validateAxleConfiguration(ok, twinSteer, existing)).toEqual({});
    expect(validateAxleConfiguration({ ...ok, code: "6x4" }, truck6x4, existing, "4")).toEqual({});
  });

  it("checks code, name and spares", () => {
    expect(validateAxleConfiguration({ code: "", name: "", spareCount: "" }, truck6x4, existing)).toEqual({
      code: "required",
      name: "required",
      spareCount: "sparesRange",
    });
    expect(
      validateAxleConfiguration(
        { code: "8X4!", name: "6X4 (3 axles, tandem drive)", spareCount: "5" },
        truck6x4,
        existing,
      ),
    ).toEqual({ code: "axleCodeFormat", name: "duplicateName", spareCount: "sparesRange" });
    expect(validateAxleConfiguration({ ...ok, code: "6x4" }, truck6x4, existing).code).toBe("duplicateCode");
  });

  it("checks the axles", () => {
    const steer = { kind: "steer", dual: false } as const;
    const drive = { kind: "drive", dual: true } as const;
    const trailer = { kind: "trailer", dual: true } as const;
    expect(validateAxleConfiguration(ok, [], existing).axles).toBe("axlesRequired");
    expect(validateAxleConfiguration(ok, Array(7).fill(drive), existing).axles).toBe("axlesMax");
    expect(validateAxleConfiguration(ok, [steer, trailer], existing).axles).toBe("axleMix");
    expect(validateAxleConfiguration(ok, [drive, steer], existing).axles).toBe("steerFirst");
    expect(validateAxleConfiguration(ok, [steer, drive, steer], existing).axles).toBe("steerFirst");
    expect(validateAxleConfiguration(ok, [steer], existing).axles).toBe("driveRequired");
    expect(validateAxleConfiguration(ok, [trailer, trailer], existing).axles).toBeUndefined();
  });
});
