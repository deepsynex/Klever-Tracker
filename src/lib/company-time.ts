"use client";

import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { useSyncExternalStore } from "react";
import { DEFAULT_TIME_ZONE, getDisplayTimeZone, isValidTimeZone, subscribeTimeZone } from "@/lib/time-zone";
import { parseApiDateTime } from "@/lib/vehicle-management/helpers";

export { isValidTimeZone };

/**
 * Timestamps come from the API in UTC ("2026-11-02 05:33:20"); people read them in the display
 * time zone (their own choice in My profile, else the company's). An unknown zone falls back to
 * the default.
 */
export function formatInCompanyTz(value: string | null | undefined, timeZone: string, pattern = "dd-MM-yyyy hh:mm:ss a"): string {
  const date = parseApiDateTime(value ?? null);
  if (!date) return "—";
  const zone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
  return format(new TZDate(date.getTime(), zone), pattern);
}

/** The zone times are shown in; re-renders when it changes. */
export function useCompanyTimeZone(): string {
  return useSyncExternalStore(subscribeTimeZone, getDisplayTimeZone, () => DEFAULT_TIME_ZONE);
}
