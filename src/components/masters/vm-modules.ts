import type { PermissionModule } from "@/lib/permissions";
import { CalendarClock, Car, Fuel, Gauge, Link2, ListTree, Repeat, Tags, Thermometer, Wrench, type LucideIcon } from "lucide-react";

export const VM_BASE = "/masters/vehicle-management";

/**
 * Vehicle Management sub-modules, in the reference site's order (Allocate + Return and Group +
 * Sub Group are one screen each, as in the API). Shared by the tabs and the overview page.
 * `perm`: the permission modules (any one of them, with view) that show the tab.
 */
export const VM_MODULES: Array<{ key: string; href: string; icon: LucideIcon; perm?: PermissionModule[] }> = [
  { key: "vehicles", href: `${VM_BASE}/vehicles`, icon: Car, perm: ["vehicles"] },
  { key: "allocations", href: `${VM_BASE}/allocations`, icon: Repeat, perm: ["other"] },
  { key: "maintenance", href: `${VM_BASE}/maintenance`, icon: Wrench, perm: ["maintenance"] },
  { key: "tempSensors", href: `${VM_BASE}/temp-sensors`, icon: Thermometer, perm: ["other"] },
  { key: "groups", href: `${VM_BASE}/groups`, icon: ListTree, perm: ["vehicle-groups"] },
  { key: "workingHours", href: `${VM_BASE}/working-hours`, icon: CalendarClock, perm: ["scheduling"] },
  { key: "distance", href: `${VM_BASE}/distance`, icon: Gauge, perm: ["other"] },
  { key: "liveLocation", href: `${VM_BASE}/live-location`, icon: Link2, perm: ["sharing"] },
  { key: "fuelCalibration", href: `${VM_BASE}/fuel-calibration`, icon: Fuel, perm: ["fuel"] },
  { key: "types", href: `${VM_BASE}/types`, icon: Tags, perm: ["vehicles", "maintenance"] },
];
