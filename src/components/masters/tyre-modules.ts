import type { PermissionModule } from "@/lib/permissions";
import { ClipboardCheck, Disc3, FileBarChart, Handshake, Truck, type LucideIcon } from "lucide-react";

// Short top-level addresses (/customers, /tyre-masters …): the pages live in the (tyres) route group.

/**
 * Tyres sub-modules (TYRE_MODULE_PLAN.md §8). Shared by the Tyres dropdown and the section guard.
 * Every one needs the `tyres` permission module.
 */
export const TYRE_MODULES: Array<{ key: string; href: string; icon: LucideIcon; perm?: PermissionModule[] }> = [
  { key: "customers", href: "/customers", icon: Handshake, perm: ["tyres"] },
  { key: "customerVehicles", href: "/customer-vehicles", icon: Truck, perm: ["tyres"] },
  { key: "inspections", href: "/tyre-inspections", icon: ClipboardCheck, perm: ["tyres"] },
  { key: "report", href: "/tyre-report", icon: FileBarChart, perm: ["tyres"] },
  { key: "tyreMasters", href: "/tyre-masters", icon: Disc3, perm: ["tyres"] },
];
