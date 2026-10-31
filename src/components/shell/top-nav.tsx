"use client";

import {
  BarChart3,
  Bell,
  CarFront,
  CircleDashed,
  Flame,
  History,
  Home,
  Map,
  Menu,
  Settings,
  Truck,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useVisibleModules } from "@/components/masters/vm-nav";
import { VM_MODULES } from "@/components/masters/vm-modules";
import { Sheet } from "@/components/ui/sheet";
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

// Users and roles live in Masters → Account Management. Visibility will follow `me.permissions` (B3).
const ITEMS: NavItem[] = [
  { key: "dashboard", icon: Home, href: "/dashboard" },
  { key: "liveMap", icon: Map, phase: 3 },
  { key: "alerts", icon: Bell, phase: 4 },
  { key: "reports", icon: BarChart3, phase: 5 },
  { key: "geofences", icon: CircleDashed, phase: 4 },
  { key: "fleet", icon: Truck, phase: 2 },
  { key: "historyShort", icon: History, href: "/history" },
  { key: "heatmap", icon: Flame, href: "/tracking/heatmap" },
  { key: "vehicles", icon: CarFront, href: "/masters/vehicle-management" },
  { key: "accounts", icon: UserCog, href: "/masters/account-management" },
  { key: "settings", icon: Settings, phase: 1 },
];

function useNavItems() {
  // Vehicle management only when the role may view one of its screens. Account management
  // always shows: everyone can change their own password there.
  const hasVehicleManagement = useVisibleModules(VM_MODULES).length > 0;
  return ITEMS.filter((item) => item.key !== "vehicles" || hasVehicleManagement);
}

function NavLink({ item, stacked, onNavigate }: { item: NavItem; stacked?: boolean; onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  // The full row doesn't fit until 1680px: below that the bar shows icons, with the label as a tooltip.
  const compactLabel = stacked ? undefined : "max-[1679px]:sr-only";
  const base = cn(
    "flex items-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-[background-color,color,box-shadow] [&_svg]:size-4 [&_svg]:shrink-0",
    stacked ? "w-full px-3 py-2.5 text-sm" : "px-2.5 py-2 text-[13px]",
  );

  if (!item.href) {
    return (
      <span
        aria-disabled="true"
        title={t("comingSoon", { n: item.phase ?? 0 })}
        className={cn(base, "cursor-not-allowed text-muted-foreground/70")}
      >
        <item.icon aria-hidden />
        <span className={compactLabel}>{t(item.key)}</span>
        {stacked ? (
          <span className="ms-auto rounded-full bg-surface-3 px-1.5 font-mono text-[10px] text-subtle">
            {t("phase", { n: item.phase ?? 0 })}
          </span>
        ) : null}
      </span>
    );
  }

  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={stacked ? undefined : t(item.key)}
      aria-current={active ? "page" : undefined}
      className={cn(
        base,
        active
          ? "bg-primary-soft text-primary shadow-[0_6px_16px_-6px_rgb(11_110_105/0.45)]"
          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
      )}
    >
      <item.icon aria-hidden />
      {/* The current page keeps its label so the bar always says where you are. */}
      <span className={active ? undefined : compactLabel}>{t(item.key)}</span>
    </Link>
  );
}

/** Horizontal main navigation; collapses into a side sheet below `xl`. */
export function TopNav() {
  const t = useTranslations("nav");
  const items = useNavItems();
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav aria-label={t("main")} className="hidden min-w-0 xl:block">
        <ul className="flex items-center gap-0.5">
          {items.map((item) => (
            <li key={item.key}>
              <NavLink item={item} />
            </li>
          ))}
        </ul>
      </nav>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("open")}
        className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-surface-2 hover:text-foreground xl:hidden"
      >
        <Menu className="size-5" aria-hidden />
      </button>
      <Sheet open={open} onOpenChange={setOpen} title={t("main")}>
        <nav aria-label={t("main")}>
          <ul className="grid gap-1">
            {items.map((item) => (
              <li key={item.key}>
                <NavLink item={item} stacked onNavigate={() => setOpen(false)} />
              </li>
            ))}
          </ul>
        </nav>
      </Sheet>
    </>
  );
}
