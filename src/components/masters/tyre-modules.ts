import type { PermissionModule } from "@/lib/permissions";
import { Disc3, Handshake, Truck, type LucideIcon } from "lucide-react";

// Short top-level addresses (/customers, /tyre-masters …): the pages live in the (tyres) route group.

/**
 * Tyres sub-modules (Phase 1: masters only). Shared by the Tyres dropdown and the section guard.
 * Every one needs the `tyres` permission module.
 */
export const TYRE_MODULES: Array<{ key: string; href: string; icon: LucideIcon; perm?: PermissionModule[] }> = [
  { key: "customers", href: "/customers", icon: Handshake, perm: ["tyres"] },
  { key: "customerVehicles", href: "/customer-vehicles", icon: Truck, perm: ["tyres"] },
  { key: "tyreMasters", href: "/tyre-masters", icon: Disc3, perm: ["tyres"] },
];
