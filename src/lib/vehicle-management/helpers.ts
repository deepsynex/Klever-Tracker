import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { COMPANY_TIME_ZONE, companyTimeToUtcIso } from "@/lib/history/selection";

/** Pure helpers for the Vehicle Management screens (no React), so Vitest can test them. */

// ---------------------------------------------------------------------------------------------
// Form values ↔ API variables
// ---------------------------------------------------------------------------------------------

/** "" → null, otherwise the trimmed text. Lets a cleared field clear the column. */
export function textOrNull(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v === "" ? null : v;
}

/** "" → null, otherwise a finite number (NaN → null). */
export function numberOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

/** Like numberOrNull, rounded to a whole number for Int fields. */
export function intOrNull(value: string | number | null | undefined): number | null {
  const n = numberOrNull(value);
  return n === null ? null : Math.round(n);
}

/** API number → form text ("" for null). */
export function numText(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

// ---------------------------------------------------------------------------------------------
// Working days ("Sun–Sat" checkboxes ↔ the API's JSON string)
// ---------------------------------------------------------------------------------------------

export const WEEK_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

/** '["mon","tue"]' → ["mon","tue"] (in week order). Anything invalid → []. */
export function parseWorkingDays(json: string | null | undefined): WeekDay[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    const set = new Set(parsed.map((d) => String(d).toLowerCase().slice(0, 3)));
    return WEEK_DAYS.filter((d) => set.has(d));
  } catch {
    return [];
  }
}

/** ["tue","mon"] → '["mon","tue"]'; no days → null. */
export function serializeWorkingDays(days: readonly string[]): string | null {
  const set = new Set(days);
  const ordered = WEEK_DAYS.filter((d) => set.has(d));
  return ordered.length ? JSON.stringify(ordered) : null;
}

// ---------------------------------------------------------------------------------------------
// Times and dates (the API is UTC; the company works in Asia/Dubai)
// ---------------------------------------------------------------------------------------------

/** "08:00:00" → "08:00" for <input type="time">. */
export function timeInputValue(apiTime: string | null | undefined): string {
  return apiTime ? apiTime.slice(0, 5) : "";
}

/** "08:00" → "08:00:00" for the API; "" → null. */
export function apiTime(inputValue: string | null | undefined): string | null {
  const v = (inputValue ?? "").trim();
  if (!v) return null;
  return v.length === 5 ? `${v}:00` : v;
}

/**
 * Parses an API timestamp to a Date; null if invalid. The API sends several shapes:
 * "2026-10-28 08:00:00" (UTC, no zone), "2026-10-28 08:00:00+00" (Postgres), and ISO with "Z"
 * or "+04:00".
 */
export function parseApiDateTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  let iso = value.trim().replace(" ", "T");
  const offset = iso.match(/([+-])(\d{2}):?(\d{2})?$/);
  if (offset && iso.length > 10) iso = `${iso.slice(0, offset.index)}${offset[1]}${offset[2]}:${offset[3] ?? "00"}`;
  else if (!/Z$/i.test(iso)) iso = `${iso}Z`;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : new Date(time);
}

/** API timestamp → "28 Oct 2026, 12:00" in the company time zone; "—" when empty. */
export function formatDateTime(value: string | null | undefined): string {
  const date = parseApiDateTime(value);
  return date ? format(new TZDate(date.getTime(), COMPANY_TIME_ZONE), "dd MMM yyyy, HH:mm") : "—";
}

/** API date ("2026-10-28", or a timestamp) → "28 Oct 2026"; "—" when empty. Dates have no zone. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  if (day) {
    const [y, m, d] = day.split("-").map(Number);
    return format(new Date(y, m - 1, d), "dd MMM yyyy");
  }
  const date = parseApiDateTime(value);
  return date ? format(new TZDate(date.getTime(), COMPANY_TIME_ZONE), "dd MMM yyyy") : "—";
}

/** "2026-10-28 00:00:00" or "2026-10-28" → "2026-10-28" for <input type="date">. */
export function dateInputValue(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}

/** API timestamp → company-time-zone { date, time } for editing in date + time inputs. */
export function companyDateTimeParts(value: string | null | undefined): { date: string; time: string } {
  const date = parseApiDateTime(value);
  if (!date) return { date: "", time: "" };
  const local = new TZDate(date.getTime(), COMPANY_TIME_ZONE);
  return { date: format(local, "yyyy-MM-dd"), time: format(local, "HH:mm") };
}

/** Company-time-zone date + time inputs → UTC ISO for the API; null when the date is empty. */
export function companyPartsToUtc(date: string, time: string): string | null {
  if (!date) return null;
  return companyTimeToUtcIso(date, time || "00:00");
}

/** Today in the company time zone, "yyyy-MM-dd". */
export function companyToday(now: Date = new Date()): string {
  return format(new TZDate(now.getTime(), COMPANY_TIME_ZONE), "yyyy-MM-dd");
}

/** Now in the company time zone, "HH:mm". */
export function companyNowTime(now: Date = new Date()): string {
  return format(new TZDate(now.getTime(), COMPANY_TIME_ZONE), "HH:mm");
}

// ---------------------------------------------------------------------------------------------
// Allocate / return
// ---------------------------------------------------------------------------------------------

/** Days a vehicle was (or has been) out: started days, at least 1. Null without a start. */
export function daysUsed(allocatedAt: string | null | undefined, returnedAt?: string | null, now = new Date()): number | null {
  const start = parseApiDateTime(allocatedAt);
  if (!start) return null;
  const end = parseApiDateTime(returnedAt ?? null) ?? now;
  const days = Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
  return Math.max(1, days);
}

/** Km driven between checkout and return; null if either reading is missing or it went backwards. */
export function kmDriven(startKm: number | null | undefined, returnKm: number | null | undefined): number | null {
  if (startKm == null || returnKm == null) return null;
  const km = returnKm - startKm;
  return km >= 0 ? Math.round(km * 10) / 10 : null;
}

/** Suggested chargeable total at return: the sum of the itemised charges. */
export function returnChargesTotal(...amounts: Array<number | null | undefined>): number {
  return roundMoney(amounts.reduce<number>((sum, a) => sum + (a ?? 0), 0));
}

// ---------------------------------------------------------------------------------------------
// Maintenance bill
// ---------------------------------------------------------------------------------------------

export type DiscountType = "percent" | "flat";

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Discount applied to an amount: percent of it, or a flat amount, never more than the amount. */
export function discountOf(amount: number, type: DiscountType, value: number | null | undefined): number {
  const v = Math.max(0, value ?? 0);
  return roundMoney(Math.min(amount, type === "percent" ? (amount * v) / 100 : v));
}

/** Line gross = quantity × unit price − line discount. */
export function lineGross(quantity: number | null, unitPrice: number | null, type: DiscountType, discount: number | null) {
  const base = (quantity ?? 0) * (unitPrice ?? 0);
  return roundMoney(base - discountOf(base, type, discount));
}

/** Bill totals: subtotal of the line grosses, the bill discount, and the total. */
export function billTotals(lineGrosses: number[], type: DiscountType, discount: number | null) {
  const subtotal = roundMoney(lineGrosses.reduce((sum, g) => sum + g, 0));
  const discountAmount = discountOf(subtotal, type, discount);
  return { subtotal, discountAmount, total: roundMoney(subtotal - discountAmount) };
}

// ---------------------------------------------------------------------------------------------
// Membership lists (group vehicles, shift vehicles, calibration points, ...)
// ---------------------------------------------------------------------------------------------

/**
 * What to change so a membership list matches the checked vehicles: vehicle ids to add and
 * membership row ids to delete.
 */
export function diffMemberships(
  checkedVehicleIds: Iterable<string>,
  current: Array<{ id: string; vehicleId: string }>,
): { add: string[]; remove: string[] } {
  const checked = new Set(checkedVehicleIds);
  const existing = new Set(current.map((m) => m.vehicleId));
  return {
    add: [...checked].filter((v) => !existing.has(v)),
    remove: current.filter((m) => !checked.has(m.vehicleId)).map((m) => m.id),
  };
}

/**
 * What to change so saved child rows match the edited list: rows without an id are created,
 * rows with an id are updated, saved ids missing from the list are deleted.
 */
export function diffRows<T extends { id?: string }>(edited: T[], savedIds: string[]) {
  const keep = new Set(edited.map((r) => r.id).filter(Boolean) as string[]);
  return {
    create: edited.filter((r) => !r.id),
    update: edited.filter((r) => r.id),
    remove: savedIds.filter((id) => !keep.has(id)),
  };
}

// ---------------------------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------------------------

export const DOCUMENT_TYPES = [
  "registration",
  "insurance",
  "permit",
  "national_permit",
  "pollution",
  "licence",
  "visa",
  "custom",
] as const;

/** The latest expiry among a vehicle's documents of one type (e.g. its insurance). */
export function latestExpiry(
  docs: Array<{ documentableId: string; type: string; expiresAt: string | null }>,
  vehicleId: string,
  type: string,
): string | null {
  return (
    docs
      .filter((d) => d.documentableId === vehicleId && d.type === type && d.expiresAt)
      .map((d) => d.expiresAt as string)
      .sort()
      .at(-1) ?? null
  );
}

/** Whether a date ("yyyy-MM-dd…") is before today (expired) or within `soonDays` of it. */
export function expiryState(value: string | null | undefined, today = companyToday(), soonDays = 30) {
  if (!value) return "none" as const;
  const day = value.slice(0, 10);
  if (day < today) return "expired" as const;
  const [y, m, d] = today.split("-").map(Number);
  const soon = format(new Date(y, m - 1, d + soonDays), "yyyy-MM-dd");
  return day <= soon ? ("soon" as const) : ("ok" as const);
}

// ---------------------------------------------------------------------------------------------
// Live location share links
// ---------------------------------------------------------------------------------------------

/** An unguessable URL-safe token (24 random bytes → 32 characters). */
export function generateShareToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Public tracking URL for a share token (the public page itself is still to be built). */
export function shareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/track/${encodeURIComponent(token)}`;
}

/** Whether a share link is active now. */
export function shareLinkState(startsAt: string | null, expiresAt: string, now = new Date()) {
  const start = parseApiDateTime(startsAt);
  const end = parseApiDateTime(expiresAt);
  if (end && end.getTime() <= now.getTime()) return "expired" as const;
  if (start && start.getTime() > now.getTime()) return "scheduled" as const;
  return "active" as const;
}

// ---------------------------------------------------------------------------------------------
// Fuel calibration
// ---------------------------------------------------------------------------------------------

/** Litres for a sensor voltage by linear interpolation over the calibration points (sorted). */
export function litresAtVoltage(points: Array<{ voltage: number; litres: number }>, voltage: number): number | null {
  const sorted = [...points].sort((a, b) => a.voltage - b.voltage);
  if (sorted.length === 0) return null;
  if (voltage <= sorted[0].voltage) return sorted[0].litres;
  const last = sorted[sorted.length - 1];
  if (voltage >= last.voltage) return last.litres;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (voltage <= b.voltage) {
      const t = b.voltage === a.voltage ? 0 : (voltage - a.voltage) / (b.voltage - a.voltage);
      return roundMoney(a.litres + (b.litres - a.litres) * t);
    }
  }
  return last.litres;
}

// ---------------------------------------------------------------------------------------------
// Live tracking glide (public /track page)
// ---------------------------------------------------------------------------------------------

/** Farther than this between two fixes is a jump (GPS glitch or data gap): don't animate it. */
export const MAX_GLIDE_METRES = 2000;

/**
 * How long the live marker takes to glide to a new fix: the real time between the two fixes, so
 * the vehicle appears to drive continuously, capped at the refresh interval (so it's done before
 * the next fix) and at least 1 s. Unknown times fall back to most of the refresh interval.
 */
export function glideDurationMs(previousFix: string | null | undefined, nextFix: string | null | undefined, refreshMs: number): number {
  const a = parseApiDateTime(previousFix);
  const b = parseApiDateTime(nextFix);
  const gap = a && b ? b.getTime() - a.getTime() : null;
  const cap = refreshMs * 0.95;
  if (gap === null || gap <= 0) return cap;
  return Math.max(1000, Math.min(gap, cap));
}

// ---------------------------------------------------------------------------------------------
// Mutation variables
// ---------------------------------------------------------------------------------------------

/**
 * Drops `null` variables that change nothing, keeping requests minimal (an omitted argument
 * means "leave as is"; an explicit null clears the field):
 * - create mutations: a missing argument already means "empty", so nulls are never sent;
 * - updates with `previous` (the saved values): null is only sent to clear a value that was set.
 * Updates without `previous` are sent as-is.
 */
export function dropUnneededNulls(
  document: string,
  variables: Record<string, unknown>,
  previous?: Record<string, unknown> | null,
): Record<string, unknown> {
  const isCreate = /^\s*mutation\s+Create/.test(document);
  if (!isCreate && !previous) return variables;
  return Object.fromEntries(
    Object.entries(variables).filter(([key, value]) => {
      if (value !== null) return true;
      if (isCreate) return false;
      return previous?.[key] !== null && previous?.[key] !== undefined;
    }),
  );
}
