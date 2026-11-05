"use client";

import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { usePathname } from "@/i18n/navigation";
import { useIsSuperAdmin } from "@/lib/map-settings";
import { can, useMe, type PermissionModule } from "@/lib/permissions";
import { AM_MODULES } from "./am-modules";
import { VM_MODULES } from "./vm-modules";

type MastersModule = { key: string; href: string; icon: LucideIcon; perm?: PermissionModule[]; superAdmin?: boolean };

/**
 * The sub-modules the signed-in user may view: no `perm`, or view rights on one of its modules.
 * Guarded ones stay hidden until the user's permissions have loaded; super-admin ones until the API
 * confirms the user is one.
 */
export function useVisibleModules(modules: MastersModule[]): MastersModule[] {
  const { data: me } = useMe();
  const { isSuperAdmin } = useIsSuperAdmin();
  return modules.filter((m) => (m.superAdmin ? isSuperAdmin : !m.perm || m.perm.some((p) => can(me, p))));
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
export function ModuleGuard({ which, children }: { which: "vm" | "am"; children: ReactNode }) {
  const t = useTranslations("masters.common");
  const pathname = usePathname();
  const { data: me, isSuccess } = useMe();
  const current: MastersModule | undefined = (which === "vm" ? VM_MODULES : AM_MODULES).find(
    (m) => pathname === m.href || pathname.startsWith(`${m.href}/`),
  );
  // Super-admin screens check that themselves (SuperAdminOnly): the layout must always render the
  // page, or Next's instant-navigation check can't validate it.
  if (isSuccess && current?.perm && !current.perm.some((p) => can(me, p))) {
    return <Alert tone="warning">{t("noAccess")}</Alert>;
  }
  return children;
}
