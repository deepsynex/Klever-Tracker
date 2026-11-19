"use client";

import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { usePathname } from "@/i18n/navigation";
import { useIsSuperAdmin } from "@/lib/map-settings";
import { can, useMe, type PermissionModule } from "@/lib/permissions";
import { AM_MODULES } from "./am-modules";
import { TYRE_MODULES } from "./tyre-modules";
import { VM_MODULES } from "./vm-modules";

const SECTIONS = { vm: VM_MODULES, am: AM_MODULES, tyres: TYRE_MODULES };

type MastersModule = {
  key: string;
  href: string;
  icon: LucideIcon;
  perm?: PermissionModule[];
  superAdmin?: boolean;
  /** Platform staff only (no company of their own). */
  platformOnly?: boolean;
  /** Company users only. */
  companyOnly?: boolean;
};

/** Whether the module is for this kind of account (platform staff or a company user). Unknown user → false. */
function fitsAccount(m: MastersModule, companyId: string | null | undefined): boolean {
  if (companyId === undefined) return !m.platformOnly && !m.companyOnly;
  if (m.platformOnly) return companyId === null;
  if (m.companyOnly) return companyId !== null;
  return true;
}

/**
 * The sub-modules the signed-in user may view: no `perm`, or view rights on one of its modules.
 * Guarded ones stay hidden until the user's permissions have loaded; super-admin ones until the API
 * confirms the user is one.
 */
export function useVisibleModules(modules: MastersModule[]): MastersModule[] {
  const { data: me } = useMe();
  const { isSuperAdmin } = useIsSuperAdmin();
  return modules.filter(
    (m) => fitsAccount(m, me?.companyId) && (m.superAdmin ? isSuperAdmin : !m.perm || m.perm.some((p) => can(me, p))),
  );
}

/** Shows `children` only to platform super admins; a "no permission" message to everyone else. */
export function SuperAdminOnly({ children }: { children: ReactNode }) {
  const t = useTranslations("masters.common");
  const { isSuperAdmin, isPending } = useIsSuperAdmin();
  if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-2" aria-busy="true" />;
  return isSuperAdmin ? children : <Alert tone="warning">{t("noAccess")}</Alert>;
}

/**
 * Shows the screen only when the user may view its sub-module; otherwise (e.g. a typed-in URL)
 * a "no permission" message instead of an empty or failing list.
 */
export function ModuleGuard({ which, children }: { which: keyof typeof SECTIONS; children: ReactNode }) {
  const t = useTranslations("masters.common");
  const pathname = usePathname();
  const { data: me, isSuccess } = useMe();
  const current: MastersModule | undefined = SECTIONS[which].find(
    (m) => pathname === m.href || pathname.startsWith(`${m.href}/`),
  );
  // Super-admin screens check that themselves (SuperAdminOnly): the layout must always render the
  // page, or Next's instant-navigation check can't validate it.
  if (
    isSuccess &&
    current &&
    (!fitsAccount(current, me.companyId) || (current.perm && !current.perm.some((p) => can(me, p))))
  ) {
    return <Alert tone="warning">{t("noAccess")}</Alert>;
  }
  return children;
}
