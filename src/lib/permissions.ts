"use client";

import { useQuery } from "@tanstack/react-query";
import { gqlRequest } from "@/lib/graphql/client";

/**
 * The signed-in user and what their role allows. `permissions` are "{module}.{action}" strings
 * (API Doc §3, `me`); platform staff (no company) get every one. The API enforces the same
 * rules, so this only decides what the UI offers.
 */
export const ME = /* GraphQL */ `
  query Me {
    me {
      id
      name
      email
      companyId
      company {
        id
        name
        timezone
        maxUsers
        maxDrivers
      }
      roles
      permissions
    }
  }
`;
export type Me = {
  id: string;
  name: string;
  email: string;
  companyId: string | null;
  company: { id: string; name: string; timezone: string; maxUsers: number | null; maxDrivers: number | null } | null;
  /** Role names (API Doc §3, `me`). */
  roles: string[];
  permissions: string[];
};

export type PermissionAction = "view" | "add" | "edit" | "delete";

/**
 * Permission modules (the API's `modules.code`), named after API Doc §6.1–6.17. Which module
 * guards each type follows the section it's documented in.
 */
export type PermissionModule =
  | "drivers"
  | "geofences"
  | "alerts"
  | "routes"
  | "maintenance"
  | "billing"
  | "vehicles"
  | "vehicle-groups"
  | "fuel"
  | "sharing"
  | "scheduling"
  | "poi"
  | "admin"
  | "other"
  | "core"
  | "live-position"
  | "department"
  | "tyres";

/**
 * Whether `me` may do `action` in `module`. Unknown user (still loading) → false. Platform staff
 * (no company of their own) may do everything, as in the API, even when a newer module (tyres) is
 * still missing from their `permissions` list.
 */
export function can(
  me: (Pick<Me, "permissions"> & Partial<Pick<Me, "companyId">>) | null | undefined,
  module: PermissionModule,
  action: PermissionAction = "view",
): boolean {
  if (!me) return false;
  if (me.companyId === null) return true;
  return me.permissions.includes(`${module}.${action}`);
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => (await gqlRequest<{ me: Me }>(ME)).me,
    staleTime: 5 * 60_000,
  });
}
