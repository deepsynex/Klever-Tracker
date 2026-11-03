"use client";

import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { usePathname } from "@/i18n/navigation";
import { can, useMe, type PermissionModule } from "@/lib/permissions";
import { AM_MODULES } from "./am-modules";
import { VM_MODULES } from "./vm-modules";

type MastersModule = { key: string; href: string; icon: LucideIcon; perm?: PermissionModule[] };

/**
 * The sub-modules the signed-in user may view: no `perm`, or view rights on one of its modules.
 * Guarded ones stay hidden until the user's permissions have loaded.
 */
export function useVisibleModules(modules: MastersModule[]): MastersModule[] {
  const { data: me } = useMe();
  return modules.filter((m) => !m.perm || m.perm.some((p) => can(me, p)));
}

/**
 * Shows the screen only when the user may view its sub-module; otherwise (e.g. a typed-in URL)
 * a "no permission" message instead of an empty or failing list.
 */
export function ModuleGuard({ which, children }: { which: "vm" | "am"; children: ReactNode }) {
  const t = useTranslations("masters.common");
  const pathname = usePathname();
  const { data: me, isSuccess } = useMe();
  const current = (which === "vm" ? VM_MODULES : AM_MODULES).find((m) => pathname === m.href || pathname.startsWith(`${m.href}/`));
  if (isSuccess && current?.perm && !current.perm.some((p) => can(me, p))) {
    return <Alert tone="warning">{t("noAccess")}</Alert>;
  }
  return children;
}
