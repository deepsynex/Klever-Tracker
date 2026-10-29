"use client";

import {
  BarChart3,
  Bell,
  CarFront,
  Building2,
  CircleDashed,
  Flame,
  History,
  LayoutDashboard,
  Map,
  ScrollText,
  Truck,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Brand } from "@/components/brand";
import { useVisibleModules } from "@/components/masters/vm-nav";
import { VM_MODULES } from "@/components/masters/vm-modules";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type NavItem = {
  key: string;
  icon: LucideIcon;
  /** Route, when the screen exists. */
  href?: string;
  /** Phase in implementation-plan.md where the screen arrives. */
  phase?: number;
};

const MAIN: NavItem[] = [
  { key: "dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { key: "alerts", icon: Bell, phase: 4 },
  { key: "reports", icon: BarChart3, phase: 5 },
  { key: "geofences", icon: CircleDashed, phase: 4 },
  { key: "fleet", icon: Truck, phase: 2 },
];

const TRACKING: NavItem[] = [
  { key: "liveMap", icon: Map, phase: 3 },
  { key: "history", icon: History, href: "/history" },
  { key: "heatmap", icon: Flame, href: "/tracking/heatmap" },
];

const MASTERS: NavItem[] = [
  { key: "vehicleManagement", icon: CarFront, href: "/masters/vehicle-management" },
  { key: "accountManagement", icon: UserCog, href: "/masters/account-management" },
];

// Users and roles live in Masters → Account Management. Visibility will follow `me.permissions` (B3).
const SETTINGS: NavItem[] = [
  { key: "departments", icon: Building2, phase: 1 },
  { key: "audit", icon: ScrollText, phase: 1 },
];

export function Sidebar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  // Vehicle management only when the role may view one of its screens. Account management
  // always shows: everyone can change their own password there.
  const hasVehicleManagement = useVisibleModules(VM_MODULES).length > 0;
  const masters = MASTERS.filter((item) => item.key !== "vehicleManagement" || hasVehicleManagement);

  const renderItem = (item: NavItem) => {
    const label = t(item.key);
    const base =
      "flex w-full items-center gap-2.5 whitespace-nowrap rounded-md px-2.5 py-[7px] text-sm font-medium [&_svg]:size-[17px] [&_svg]:shrink-0";

    if (!item.href) {
      return (
        <li key={item.key}>
          <span
            aria-disabled="true"
            title={t("comingSoon", { n: item.phase ?? 0 })}
            className={cn(base, "cursor-not-allowed text-muted-foreground/60")}
          >
            <item.icon aria-hidden />
            <span className="min-w-0 truncate">{label}</span>
            <span className="ms-auto hidden shrink-0 rounded-full bg-surface-3 px-1.5 font-mono text-[10px] text-subtle lg:inline">
              {t("phase", { n: item.phase ?? 0 })}
            </span>
          </span>
        </li>
      );
    }

    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
    return (
      <li key={item.key}>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={cn(
            base,
            active
              ? "bg-surface text-primary shadow-[0_1px_2px_rgb(0_0_0/0.06)]"
              : "text-muted-foreground hover:bg-surface-3 hover:text-foreground",
          )}
        >
          <item.icon aria-hidden />
          <span>{label}</span>
        </Link>
      </li>
    );
  };

  return (
    <aside className="border-b border-border bg-surface-2 lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-e">
      <div className="hidden px-4 pb-3 pt-4 lg:block">
        <Brand />
      </div>
      <nav aria-label={t("main")} className="overflow-x-auto px-2 py-2 lg:overflow-visible">
        <ul className="flex gap-0.5 lg:flex-col">
          {MAIN.map(renderItem)}
          <li aria-hidden className="mx-1.5 my-2 hidden h-px bg-border lg:block" />
          <li className="hidden px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-subtle lg:block">
            {t("trackingGroup")}
          </li>
          {TRACKING.map(renderItem)}
          <li aria-hidden className="mx-1.5 my-2 hidden h-px bg-border lg:block" />
          <li className="hidden px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-subtle lg:block">
            {t("mastersGroup")}
          </li>
          {masters.map(renderItem)}
          <li aria-hidden className="mx-1.5 my-2 hidden h-px bg-border lg:block" />
          <li className="hidden px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-subtle lg:block">
            {t("settingsGroup")}
          </li>
          {SETTINGS.map(renderItem)}
        </ul>
      </nav>
    </aside>
  );
}
