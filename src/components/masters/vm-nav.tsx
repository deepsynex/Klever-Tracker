"use client";

import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Link, usePathname } from "@/i18n/navigation";
import { can, useMe, type PermissionModule } from "@/lib/permissions";
import { cn } from "@/lib/utils";
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

/** Horizontal sub-module tabs for a Masters module. `namespace` holds the tab labels and `label`. */
function ModuleTabs({ modules, namespace }: { modules: MastersModule[]; namespace: string }) {
  const t = useTranslations(namespace);
  const pathname = usePathname();
  const visible = useVisibleModules(modules);

  return (
    <nav aria-label={t("label")} className="-mx-1 overflow-x-auto pb-1">
      <ul className="flex min-w-max gap-1 px-1">
        {visible.map((m) => {
          const active = pathname === m.href || pathname.startsWith(`${m.href}/`);
          return (
            <li key={m.key}>
              <Link
                href={m.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-ctl border px-3 py-1.5 text-[13px] font-medium [&_svg]:size-4",
                  active
                    ? "border-primary/40 bg-primary-soft text-primary"
                    : "border-transparent text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <m.icon aria-hidden />
                {t(m.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Tabs shown above every Vehicle Management screen. */
export function VmNav() {
  return <ModuleTabs modules={VM_MODULES} namespace="masters.vm.modules" />;
}

/** Tabs shown above every Account Management screen. */
export function AmNav() {
  return <ModuleTabs modules={AM_MODULES} namespace="masters.am.modules" />;
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

/** Overview cards (one per sub-module the user may view). `namespace` holds `modules.*` and `moduleHints.*`. */
export function ModuleCards({ which, namespace, className }: { which: "vm" | "am"; namespace: string; className: string }) {
  const t = useTranslations(namespace);
  const visible = useVisibleModules(which === "vm" ? VM_MODULES : AM_MODULES);
  return (
    <ul className={className}>
      {visible.map((m) => (
        <li key={m.key}>
          <Link
            href={m.href}
            className="grid h-full gap-1.5 rounded-card border border-border bg-surface p-4 transition-colors hover:border-primary/50 hover:bg-primary-soft/30"
          >
            <span className="flex items-center gap-2 text-sm font-semibold [&_svg]:size-4 [&_svg]:text-primary">
              <m.icon aria-hidden />
              {t(`modules.${m.key}`)}
            </span>
            <span className="text-[13px] text-muted-foreground">{t(`moduleHints.${m.key}`)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
