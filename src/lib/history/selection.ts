import { TZDate } from "@date-fns/tz";
import { format, subDays } from "date-fns";

/** Pure helpers for the tracking history page, kept free of React so Vitest can test them. */

export const COMPANY_TIME_ZONE = "Asia/Dubai";

/** Something the user can track: a vehicle (all its history) or a single tracker device. */
export type TrackTarget = { key: string; kind: "vehicle" | "device"; id: string; label: string; vehicleId?: string | null };

type VehicleLike = { id: string; plateNo: string; vehicleName?: string | null };
type DeviceLike = { id: string; imei: string; vehicleId?: string | null };

/**
 * Builds the vehicle/device picker from the company's own records. Never adds placeholder
 * entries: another company's device would only come back empty from the API.
 */
export function buildTrackTargets(vehicles: VehicleLike[], devices: DeviceLike[]): TrackTarget[] {
  const plateById = new Map(vehicles.map((v) => [v.id, v.plateNo]));
  return [
    ...vehicles.map((v) => ({
      key: `vehicle:${v.id}`,
      kind: "vehicle" as const,
      id: v.id,
      label: v.vehicleName ? `${v.plateNo} — ${v.vehicleName}` : v.plateNo,
      vehicleId: v.id,
    })),
    ...devices.map((d) => {
      const plate = d.vehicleId ? plateById.get(d.vehicleId) : undefined;
      return {
        key: `device:${d.id}`,
        kind: "device" as const,
        id: d.id,
        label: plate ? `${d.imei} (${plate})` : d.imei,
        vehicleId: d.vehicleId ?? null,
      };
    }),
  ];
}

/** `positionHistory` filter for a target: exactly one of vehicleId or deviceId, never both. */
export function historyFilter(target: TrackTarget): { vehicleId: string } | { deviceId: string } {
  return target.kind === "vehicle" ? { vehicleId: target.id } : { deviceId: target.id };
}

/** Company-time-zone date ("2026-10-27") and time ("06:30") → UTC ISO string for the API. */
export function companyTimeToUtcIso(date: string, time: string, seconds = 0): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(new TZDate(y, m - 1, d, hh, mm, seconds, COMPANY_TIME_ZONE).getTime()).toISOString();
}

/** A "yyyy-MM-dd" date `daysAgo` days before today in the company time zone. */
export function companyDate(daysAgo = 0, now: Date = new Date()): string {
  return format(subDays(new TZDate(now.getTime(), COMPANY_TIME_ZONE), daysAgo), "yyyy-MM-dd");
}
