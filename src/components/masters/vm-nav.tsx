"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { VM_MODULES } from "./vm-modules";

/** Horizontal sub-module tabs shown above every Vehicle Management screen. */
export function VmNav() {
  const t = useTranslations("masters.vm.modules");
  const pathname = usePathname();

  return (
    <nav aria-label={t("label")} className="-mx-1 overflow-x-auto pb-1">
      <ul className="flex min-w-max gap-1 px-1">
        {VM_MODULES.map((m) => {
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
