/**
 * Tyre inspection calculations (TYRE_MODULE_PLAN.md §5). The backend computes and stores the
 * conditions when an inspection is saved; the web uses the same rules to show them live while
 * typing, and the km / CPK metrics for the report. Pure, so every rule is unit tested.
 * Fixes the Excel defects by design: null instead of #DIV/0! when there's no wear yet, and running
 * km per tyre (from its own fitments), not per vehicle.
 */

/** Company thresholds (tyreSettings); the defaults come from the Excel tool. */
export type TyreThresholds = {
  /** Tread below this (mm) on any groove: critical. */
  criticalMm: number;
  /** Tread below this (mm) on any groove: needs replacement. */
  replaceMm: number;
  /** Pressure within ± this percentage of the recommended: good. */
  pressureTolerancePct: number;
  /** Tread depth the tyre is taken off at (mm), for expected life. */
  removalMm: number;
};
export const DEFAULT_THRESHOLDS: TyreThresholds = {
  criticalMm: 6,
  replaceMm: 3,
  pressureTolerancePct: 10,
  removalMm: 2,
};

export type TreadCondition = "good" | "critical" | "needs_replacement";
export type PressureCondition = "good" | "over_inflated" | "under_inflated";
export type WearCondition = "uniform" | "outer" | "inner" | "center" | "shoulder";
/** What the inspector says about the tyre itself. */
export const TYRE_CONDITIONS = ["new", "running", "rotated", "retread", "removed"] as const;
export type TyreCondition = (typeof TYRE_CONDITIONS)[number];

const valid = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);

/** Any groove below the replace depth → needs replacement; below the critical depth → critical; else good. */
export function treadCondition(
  grooves: Array<number | null | undefined>,
  th: TyreThresholds = DEFAULT_THRESHOLDS,
): TreadCondition | null {
  const depths = grooves.filter(valid);
  if (!depths.length) return null;
  const min = Math.min(...depths);
  if (min < th.replaceMm) return "needs_replacement";
  if (min < th.criticalMm) return "critical";
  return "good";
}

/** Within ± tolerance % of the recommended pressure → good; above → over-inflated; below → under-inflated. */
export function pressureCondition(
  actual: number | null | undefined,
  recommended: number | null | undefined,
  th: TyreThresholds = DEFAULT_THRESHOLDS,
): PressureCondition | null {
  if (!valid(actual) || !valid(recommended)) return null;
  if (Math.abs(actual - recommended) <= (recommended * th.pressureTolerancePct) / 100) return "good";
  return actual > recommended ? "over_inflated" : "under_inflated";
}

/** Grooves differing by more than this (mm) count as uneven wear. */
export const WEAR_DIFF_MM = 1;

/**
 * Where the tyre is wearing, from its three grooves (less tread = more wear):
 * - all within 1 mm → uniform;
 * - centre lower than both shoulders → center (typically over-inflation);
 * - both shoulders lower than the centre → shoulder (typically under-inflation);
 * - otherwise the lower shoulder → outer or inner (typically alignment).
 */
export function wearCondition(
  outer: number | null | undefined,
  center: number | null | undefined,
  inner: number | null | undefined,
): WearCondition | null {
  if (!valid(outer) || !valid(center) || !valid(inner)) return null;
  if (Math.max(outer, center, inner) - Math.min(outer, center, inner) <= WEAR_DIFF_MM) return "uniform";
  if (outer - center > WEAR_DIFF_MM && inner - center > WEAR_DIFF_MM) return "center";
  if (center - outer > WEAR_DIFF_MM && center - inner > WEAR_DIFF_MM) return "shoulder";
  return outer < inner ? "outer" : "inner";
}

/** Mean of the grooves that were measured; null when none was. */
export function averageTread(...grooves: Array<number | null | undefined>): number | null {
  const depths = grooves.filter(valid);
  return depths.length ? depths.reduce((s, d) => s + d, 0) / depths.length : null;
}

/** Share of the original tread worn away (0–1); null without both depths. */
export function wearPercent(avg: number | null, original: number | null | undefined): number | null {
  if (!valid(avg) || !valid(original) || original <= 0) return null;
  return Math.min(1, Math.max(0, 1 - avg / original));
}

export type Fitment = { fittedOdometerKm: number | null; removedOdometerKm: number | null; removedAt: string | null };

/**
 * Km the tyre has run: over each of its fitments, (removal odometer, or the vehicle's current one
 * for the fitment still open) − fitting odometer. Fitments without readings are skipped.
 */
export function runningKm(fitments: Fitment[], currentOdometerKm: number | null | undefined): number | null {
  let total = 0;
  let any = false;
  for (const f of fitments) {
    const end = f.removedAt ? f.removedOdometerKm : (currentOdometerKm ?? null);
    if (!valid(f.fittedOdometerKm) || !valid(end) || end < f.fittedOdometerKm) continue;
    total += end - f.fittedOdometerKm;
    any = true;
  }
  return any ? total : null;
}

/** Km per mm of tread worn; null when there's no wear (or no km) yet. */
export function wearRate(km: number | null, original: number | null | undefined, avg: number | null): number | null {
  if (!valid(km) || !valid(original) || !valid(avg)) return null;
  const worn = original - avg;
  return worn > 0 && km > 0 ? km / worn : null;
}

/** Km the tyre is expected to last down to the removal depth. */
export function expectedLifeKm(
  rate: number | null,
  original: number | null | undefined,
  th: TyreThresholds = DEFAULT_THRESHOLDS,
): number | null {
  if (!valid(rate) || !valid(original)) return null;
  const usable = original - th.removalMm;
  return usable > 0 ? rate * usable : null;
}

/** Cost per km so far (price ÷ running km). */
export function currentCpk(price: number | null | undefined, km: number | null): number | null {
  return valid(price) && valid(km) && km > 0 ? price / km : null;
}

/** Cost per km over the expected life (price ÷ expected life). */
export function expectedCpk(price: number | null | undefined, life: number | null): number | null {
  return valid(price) && valid(life) && life > 0 ? price / life : null;
}

/** Every metric for one tyre at one inspection. */
export function tyreMetrics(
  input: {
    outer: number | null;
    center: number | null;
    inner: number | null;
    actualPressure: number | null;
    recommendedPressure: number | null;
    originalTread: number | null;
    price: number | null;
    fitments: Fitment[];
    currentOdometerKm: number | null;
  },
  th: TyreThresholds = DEFAULT_THRESHOLDS,
) {
  const avg = averageTread(input.outer, input.center, input.inner);
  const km = runningKm(input.fitments, input.currentOdometerKm);
  const rate = wearRate(km, input.originalTread, avg);
  const life = expectedLifeKm(rate, input.originalTread, th);
  return {
    avgTread: avg,
    tread: treadCondition([input.outer, input.center, input.inner], th),
    pressure: pressureCondition(input.actualPressure, input.recommendedPressure, th),
    wear: wearCondition(input.outer, input.center, input.inner),
    wearPct: wearPercent(avg, input.originalTread),
    runningKm: km,
    wearRateKmPerMm: rate,
    expectedLifeKm: life,
    currentCpk: currentCpk(input.price, km),
    expectedCpk: expectedCpk(input.price, life),
  };
}
