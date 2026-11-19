/**
 * New inspection (TYRE_MODULE_PLAN.md §8): the header and per-tyre readings as typed in, their
 * checks, the recommendations suggested from the conditions, and the save payload. Pure, so it's
 * unit tested. Errors are translation keys under `validation.*`.
 */
import type { TyreInspectionItemInput } from "@/lib/graphql/tyre-inspections";
import { numberOrNull, textOrNull } from "@/lib/vehicle-management/helpers";
import type { PressureCondition, TreadCondition, TyreCondition, WearCondition } from "./metrics";

type Errors = Record<string, string>;

export type InspectionHeader = { vehicleId: string; date: string; time: string; odometerKm: string; remarks: string };

/** One position's reading as typed (strings straight from the inputs). */
export type Reading = {
  actualPressurePsi: string;
  /** Starts at the tyre product's; typed in where the position has only a size. */
  recommendedPsi: string;
  outer: string;
  center: string;
  inner: string;
  tyreCondition: TyreCondition;
  photoPath: string;
  remarks: string;
  recommendationIds: string[];
};
export const emptyReading = (recommendedPsi: number | null = null): Reading => ({
  actualPressurePsi: "",
  recommendedPsi: recommendedPsi === null ? "" : String(recommendedPsi),
  outer: "",
  center: "",
  inner: "",
  tyreCondition: "running",
  photoPath: "",
  remarks: "",
  recommendationIds: [],
});

export const MAX_PRESSURE_PSI = 200;
export const MAX_TREAD_MM = 40;

const blank = (v: string) => !v.trim();
const outOf = (v: string, max: number) => {
  const n = numberOrNull(v);
  return n === null || n < 0 || n > max;
};

/**
 * Vehicle, date and time required (not in the future); the odometer is required and can't be lower
 * than the last reading we know of (the vehicle's, or its last inspection's) - Excel defect 7.
 */
export function validateHeader(
  h: InspectionHeader,
  context: { lastOdometerKm: number | null; nowUtc: string; atUtc: string | null },
): Errors {
  const errors: Errors = {};
  if (blank(h.vehicleId)) errors.vehicleId = "required";
  if (blank(h.date)) errors.date = "required";
  if (blank(h.time)) errors.time = "required";
  else if (context.atUtc && context.atUtc > context.nowUtc) errors.time = "notFuture";
  if (blank(h.odometerKm)) errors.odometerKm = "required";
  else if (outOf(h.odometerKm, 10_000_000)) errors.odometerKm = "nonNegative";
  else if (context.lastOdometerKm !== null && (numberOrNull(h.odometerKm) ?? 0) < context.lastOdometerKm) {
    errors.odometerKm = "odometerBack";
  }
  return errors;
}

/** A complete reading: pressure and all three groove depths, each in a sensible range (recommended pressure optional). */
export function validateReading(r: Reading): Errors {
  const errors: Errors = {};
  if (blank(r.actualPressurePsi)) errors.actualPressurePsi = "required";
  else if (outOf(r.actualPressurePsi, MAX_PRESSURE_PSI)) errors.actualPressurePsi = "pressureRange";
  if (!blank(r.recommendedPsi) && outOf(r.recommendedPsi, MAX_PRESSURE_PSI)) errors.recommendedPsi = "pressureRange";
  for (const key of ["outer", "center", "inner"] as const) {
    if (blank(r[key])) errors[key] = "required";
    else if (outOf(r[key], MAX_TREAD_MM)) errors[key] = "treadRange";
  }
  if (r.tyreCondition === "removed" && blank(r.remarks)) errors.remarks = "required";
  return errors;
}

/**
 * Recommendation codes the conditions call for (the four defaults): wrong pressure → correct
 * pressure; uneven shoulder wear → check alignment; tread at replacement depth → retread; uneven
 * centre / shoulder wear → rotate. The inspector can untick any of them.
 */
export function suggestedCodes(c: {
  tread: TreadCondition | null;
  pressure: PressureCondition | null;
  wear: WearCondition | null;
}): string[] {
  const codes = new Set<string>();
  if (c.pressure && c.pressure !== "good") codes.add("correct_pressure");
  if (c.wear === "outer" || c.wear === "inner") codes.add("check_alignment");
  if (c.wear === "center" || c.wear === "shoulder") codes.add("rotate_tyre");
  if (c.tread === "needs_replacement") codes.add("retread_tyre");
  return [...codes];
}

/**
 * The whole visit as the API takes it: the header plus every completed reading, by position. The
 * tyre is optional (most positions have only a size); the backend fills in a fitted tyre itself.
 */
export function inspectionInput(
  h: InspectionHeader,
  atUtc: string,
  readings: Record<string, Reading>,
  positions: Array<{ code: string; tyreId: string | null }>,
) {
  const items: TyreInspectionItemInput[] = positions.flatMap((p) => {
    const r = readings[p.code];
    if (!r || Object.keys(validateReading(r)).length) return [];
    return [
      {
        positionCode: p.code,
        tyreId: p.tyreId,
        actualPressurePsi: numberOrNull(r.actualPressurePsi),
        recommendedPressurePsi: numberOrNull(r.recommendedPsi),
        outerTreadMm: numberOrNull(r.outer),
        centerTreadMm: numberOrNull(r.center),
        innerTreadMm: numberOrNull(r.inner),
        tyreCondition: r.tyreCondition,
        photoPath: textOrNull(r.photoPath),
        remarks: textOrNull(r.remarks),
        recommendationIds: r.recommendationIds,
      },
    ];
  });
  return {
    vehicleId: h.vehicleId,
    inspectedAt: atUtc,
    odometerKm: numberOrNull(h.odometerKm),
    remarks: textOrNull(h.remarks),
    items,
  };
}
