"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

/**
 * How tyre conditions look everywhere (inspection, report): a status tone with a text label, never
 * colour alone. Status colours are reserved for these states.
 */
type Tone = "ok" | "warn" | "bad" | "muted" | "info";

const TONES: Record<string, Tone> = {
  good: "ok",
  uniform: "ok",
  critical: "warn",
  over_inflated: "warn",
  under_inflated: "warn",
  outer: "warn",
  inner: "warn",
  center: "warn",
  shoulder: "warn",
  needs_replacement: "bad",
};

export const conditionTone = (condition: string): Tone => TONES[condition] ?? "muted";

/** Ring on the axle drawing for an inspected tyre, by its tread condition. */
export const CONDITION_RING: Record<string, string> = {
  good: "#16a34a",
  critical: "#f59e0b",
  needs_replacement: "#dc2626",
};

/** "Good", "Under-inflated", "Shoulder wear"… for any tread, pressure or wear condition. */
export function useConditionLabel() {
  const t = useTranslations("masters.tyres.conditions");
  return useCallback((condition: string) => (t.has(condition) ? t(condition) : condition), [t]);
}
