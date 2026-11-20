/**
 * A vehicle to start a New inspection with, handed from Customer vehicles' "Save & inspect" to the
 * Inspections page (no query strings in the URL). It's taken once: reading it clears it, so a later
 * visit to Inspections opens the list as usual.
 */
export const INSPECT_VEHICLE_KEY = "kt.tyreInspect.vehicle";

export function writeInspectVehicle(vehicleId: string): void {
  try {
    window.sessionStorage.setItem(INSPECT_VEHICLE_KEY, vehicleId);
  } catch {
    // Storage blocked: Inspections just opens the list.
  }
}

/** The vehicle handed over, if any, cleared as it's read. */
export function takeInspectVehicle(): string {
  try {
    const id = window.sessionStorage.getItem(INSPECT_VEHICLE_KEY) ?? "";
    window.sessionStorage.removeItem(INSPECT_VEHICLE_KEY);
    return id;
  } catch {
    return "";
  }
}
