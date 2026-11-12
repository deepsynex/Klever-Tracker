import type { PermissionModule } from "@/lib/permissions";
import { Bell, CalendarClock, Car, CircleDashed, Fuel, Gauge, Link2, ListTree, Repeat, Tags, Thermometer, Wrench, type LucideIcon } from "lucide-react";

// Short top-level addresses (/vehicles, /allocations …): the pages live in the (vehicles) route group.

/**
 * Vehicle Management sub-modules, in the reference site's order (Allocate + Return and Group +
 * Sub Group are one screen each, as in the API). Shared by the Vehicles dropdown and the section guard.
 * `perm`: the permission modules (any one of them, with view) that show the tab.
 */
export const VM_MODULES: Array<{ key: string; href: string; icon: LucideIcon; perm?: PermissionModule[] }> = [
  { key: "vehicles", href: "/vehicles", icon: Car, perm: ["vehicles"] },
  { key: "allocations", href: "/allocations", icon: Repeat, perm: ["other"] },
  { key: "maintenance", href: "/maintenance", icon: Wrench, perm: ["maintenance"] },
  { key: "tempSensors", href: "/temp-sensors", icon: Thermometer, perm: ["other"] },
  { key: "groups", href: "/groups", icon: ListTree, perm: ["vehicle-groups"] },
  { key: "geofences", href: "/geofences", icon: CircleDashed, perm: ["geofences"] },
  // Lives at /notifications (outside the vehicles route group); everyone may open it.
  { key: "notifications", href: "/notifications", icon: Bell },
  { key: "workingHours", href: "/working-hours", icon: CalendarClock, perm: ["scheduling"] },
  { key: "distance", href: "/distance", icon: Gauge, perm: ["other"] },
  { key: "liveLocation", href: "/live-location", icon: Link2, perm: ["sharing"] },
  { key: "fuelCalibration", href: "/fuel-calibration", icon: Fuel, perm: ["fuel"] },
  { key: "types", href: "/types", icon: Tags, perm: ["vehicles", "maintenance"] },
];
