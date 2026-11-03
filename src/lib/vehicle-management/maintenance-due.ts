/**
 * "Maintenance due" for the Vehicle details screen. Pure, so Vitest can test it.
 *
 * A vehicle is due when the km driven since its last completed service reach its service interval.
 * The km at that service comes from the Maintenance records (the vehicle itself only stores a
 * last-service *date*). With no completed record carrying an odometer reading, the count starts at 0 km.
 */

export type DueVehicle = { id: string; odometerKm: number | null; serviceIntervalKm: number | null };
export type DueRecord = { vehicleId: string; odometerKm: number | null; status: string };

/** Odometer reading at each vehicle's last completed service (the highest reading, as odometers only grow). */
export function lastServiceOdometers(records: DueRecord[]): Map<string, number> {
  const byVehicle = new Map<string, number>();
  for (const r of records) {
    if (r.status !== "completed" || typeof r.odometerKm !== "number") continue;
    const prev = byVehicle.get(r.vehicleId);
    if (prev === undefined || r.odometerKm > prev) byVehicle.set(r.vehicleId, r.odometerKm);
  }
  return byVehicle;
}

/** Km driven since the last completed service, or null when the vehicle has no odometer reading. */
export function kmSinceService(vehicle: DueVehicle, lastService: Map<string, number>): number | null {
  if (typeof vehicle.odometerKm !== "number") return null;
  return Math.max(0, vehicle.odometerKm - (lastService.get(vehicle.id) ?? 0));
}

/** True when a service interval is set and the km since the last service have reached it. */
export function isMaintenanceDue(vehicle: DueVehicle, lastService: Map<string, number>): boolean {
  if (typeof vehicle.serviceIntervalKm !== "number" || vehicle.serviceIntervalKm <= 0) return false;
  const since = kmSinceService(vehicle, lastService);
  return since !== null && since >= vehicle.serviceIntervalKm;
}
