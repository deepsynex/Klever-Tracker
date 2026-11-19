/**
 * The vehicle the tyre report shows, remembered in this browser (no query strings in the URL):
 * Inspections' "Report" button sets it before opening the report page.
 */
export const REPORT_VEHICLE_KEY = "kt.tyreReport.vehicle";

export function readReportVehicle(): string {
  try {
    return window.localStorage.getItem(REPORT_VEHICLE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeReportVehicle(vehicleId: string): void {
  try {
    if (vehicleId) window.localStorage.setItem(REPORT_VEHICLE_KEY, vehicleId);
    else window.localStorage.removeItem(REPORT_VEHICLE_KEY);
  } catch {
    // Storage blocked: the report just starts without a vehicle picked.
  }
}
