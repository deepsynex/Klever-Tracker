import type { PermissionModule } from "@/lib/permissions";
import { Building2, CircleUserRound, Gauge, IdCard, KeyRound, Network, ScrollText, ShieldCheck, Users, type LucideIcon } from "lucide-react";

export const AM_BASE = "/masters/account-management";
export const CHANGE_PASSWORD_HREF = `${AM_BASE}/change-password`;
export const PROFILE_HREF = `${AM_BASE}/profile`;
export const AUDIT_HREF = `${AM_BASE}/audit-log`;

/**
 * Account Management sub-modules, in the reference site's order (Staff and Passenger are out of
 * scope). Shared by the tabs and the overview page. `perm`: as in VM_MODULES (My profile and Change Password
 * are for everyone).
 */
export const AM_MODULES: Array<{ key: string; href: string; icon: LucideIcon; perm?: PermissionModule[] }> = [
  { key: "accounts", href: `${AM_BASE}/accounts`, icon: Building2, perm: ["core"] },
  { key: "users", href: `${AM_BASE}/users`, icon: Users, perm: ["core"] },
  { key: "drivers", href: `${AM_BASE}/drivers`, icon: IdCard, perm: ["drivers"] },
  { key: "roles", href: `${AM_BASE}/roles`, icon: ShieldCheck, perm: ["core"] },
  { key: "departments", href: `${AM_BASE}/departments`, icon: Network, perm: ["department"] },
  { key: "auditLog", href: AUDIT_HREF, icon: ScrollText, perm: ["admin"] },
  { key: "profile", href: PROFILE_HREF, icon: CircleUserRound },
  { key: "changePassword", href: CHANGE_PASSWORD_HREF, icon: KeyRound },
  { key: "driverBehaviour", href: `${AM_BASE}/driver-behaviour`, icon: Gauge, perm: ["other"] },
];
