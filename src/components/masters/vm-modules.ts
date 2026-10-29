import { CalendarClock, Car, Fuel, Gauge, Link2, ListTree, Repeat, Tags, Thermometer, Wrench, type LucideIcon } from "lucide-react";

export const VM_BASE = "/masters/vehicle-management";

/**
 * Vehicle Management sub-modules, in the reference site's order (Allocate + Return and Group +
 * Sub Group are one screen each, as in the API). Shared by the tabs and the overview page.
 */
export const VM_MODULES: Array<{ key: string; href: string; icon: LucideIcon }> = [
  { key: "vehicles", href: `${VM_BASE}/vehicles`, icon: Car },
  { key: "allocations", href: `${VM_BASE}/allocations`, icon: Repeat },
  { key: "maintenance", href: `${VM_BASE}/maintenance`, icon: Wrench },
  { key: "tempSensors", href: `${VM_BASE}/temp-sensors`, icon: Thermometer },
  { key: "groups", href: `${VM_BASE}/groups`, icon: ListTree },
  { key: "workingHours", href: `${VM_BASE}/working-hours`, icon: CalendarClock },
  { key: "distance", href: `${VM_BASE}/distance`, icon: Gauge },
  { key: "liveLocation", href: `${VM_BASE}/live-location`, icon: Link2 },
  { key: "fuelCalibration", href: `${VM_BASE}/fuel-calibration`, icon: Fuel },
  { key: "types", href: `${VM_BASE}/types`, icon: Tags },
];
