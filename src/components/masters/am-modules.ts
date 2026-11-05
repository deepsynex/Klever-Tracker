import type { PermissionModule } from "@/lib/permissions";
import { Building2, CircleUserRound, Gauge, IdCard, KeyRound, Map, Network, ScrollText, ShieldCheck, Users, type LucideIcon } from "lucide-react";

// Short top-level addresses (/accounts, /users …): the pages live in the (account) route group.
export const CHANGE_PASSWORD_HREF = "/change-password";
export const PROFILE_HREF = "/profile";
export const AUDIT_HREF = "/audit-log";
export const MAP_SETTINGS_HREF = "/map-settings";

/**
 * Account Management sub-modules, in the reference site's order (Staff and Passenger are out of
 * scope). Shared by the Account & settings dropdown and the section guard. `perm`: as in VM_MODULES (My profile and Change Password
 * are for everyone). `superAdmin`: platform super admins only (platform-wide settings).
 */
export const AM_MODULES: Array<{ key: string; href: string; icon: LucideIcon; perm?: PermissionModule[]; superAdmin?: boolean }> = [
  { key: "accounts", href: "/accounts", icon: Building2, perm: ["core"] },
  { key: "users", href: "/users", icon: Users, perm: ["core"] },
  { key: "drivers", href: "/drivers", icon: IdCard, perm: ["drivers"] },
  { key: "roles", href: "/roles", icon: ShieldCheck, perm: ["core"] },
  { key: "departments", href: "/departments", icon: Network, perm: ["department"] },
  { key: "auditLog", href: AUDIT_HREF, icon: ScrollText, perm: ["admin"] },
  { key: "profile", href: PROFILE_HREF, icon: CircleUserRound },
  { key: "changePassword", href: CHANGE_PASSWORD_HREF, icon: KeyRound },
  { key: "driverBehaviour", href: "/driver-behaviour", icon: Gauge, perm: ["other"] },
  { key: "mapSettings", href: MAP_SETTINGS_HREF, icon: Map, superAdmin: true },
];
