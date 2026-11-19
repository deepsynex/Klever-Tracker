/**
 * Turns an axle configuration's tyre positions (API: code, axleNo, side, placement) into rows for
 * the top-down diagram: one row per axle, front first, tyres left to right as seen from above
 * (left outer, left inner | right inner, right outer). Pure, so it's unit tested.
 */
import type { AxlePosition } from "@/lib/graphql/tyres";

/** Steer (front, "F…"), drive ("D…") or trailer ("T…") axle, from the position codes. */
export type AxleKind = "steer" | "drive" | "trailer" | "axle";

export type AxleRow = {
  axleNo: number;
  kind: AxleKind;
  /** 1-based count within its kind (drive axle 1, 2…). */
  kindNo: number;
  /** Tyres on the vehicle's left side, outermost first. */
  left: AxlePosition[];
  /** Tyres on the vehicle's right side, innermost first. */
  right: AxlePosition[];
};

const ORDER = { outer: 0, single: 1, inner: 2 } as const;

function kindOf(positions: AxlePosition[]): AxleKind {
  const prefix = positions[0]?.code[0]?.toUpperCase();
  return prefix === "F" ? "steer" : prefix === "D" ? "drive" : prefix === "T" ? "trailer" : "axle";
}

export function axleRows(positions: AxlePosition[]): AxleRow[] {
  const byAxle = new Map<number, AxlePosition[]>();
  for (const p of positions) byAxle.set(p.axleNo, [...(byAxle.get(p.axleNo) ?? []), p]);
  const counts: Record<AxleKind, number> = { steer: 0, drive: 0, trailer: 0, axle: 0 };
  return [...byAxle.entries()]
    .sort(([a], [b]) => a - b)
    .map(([axleNo, list]) => {
      const kind = kindOf(list);
      counts[kind] += 1;
      const side = (s: AxlePosition["side"]) => list.filter((p) => p.side === s);
      return {
        axleNo,
        kind,
        kindNo: counts[kind],
        left: side("left").sort((a, b) => ORDER[a.placement] - ORDER[b.placement]),
        right: side("right").sort((a, b) => ORDER[b.placement] - ORDER[a.placement]),
      };
    });
}

/** Whether the layout is a trailer (no cab: drawn with a coupling at the front). */
export const isTrailer = (rows: AxleRow[]) => rows.length > 0 && rows.every((r) => r.kind === "trailer");

/** Spare positions are SP1, SP2, … (as many as the vehicle's spareTyreCount, 0–4). */
export const spareCodes = (count: number) => Array.from({ length: Math.max(0, count) }, (_, i) => `SP${i + 1}`);
/** The "axle" number the spares' tyre size is kept under (API: axleNo 0). */
export const SPARE_AXLE = 0;
export const MAX_SPARES = 4;

/** One tyre-size slot per axle (all its tyres share a size), plus one for the spares: what the vehicle form asks for. */
export function axleSizeSlots(
  positions: AxlePosition[],
  spareCount = 1,
): Array<{ axleNo: number; kind: AxleKind | "spare"; kindNo: number; tyres: number }> {
  return [
    ...axleRows(positions).map((r) => ({
      axleNo: r.axleNo,
      kind: r.kind,
      kindNo: r.kindNo,
      tyres: r.left.length + r.right.length,
    })),
    ...(spareCount > 0 ? [{ axleNo: SPARE_AXLE, kind: "spare" as const, kindNo: 1, tyres: spareCount }] : []),
  ];
}
