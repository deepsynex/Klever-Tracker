"use client";

import {
  BarChart3,
  Bell,
  CarFront,
  ChevronDown,
  CircleDashed,
  Flame,
  History,
  Home,
  MapPin,
  Menu,
  Navigation,
  Radio,
  Route,
  Settings,
  ShoppingCart,
  Truck,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
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

type NavGroup = {
  key: string;
  icon: LucideIcon;
  namespace?: string;
  children: NavItem[];
};

type NavEntry = NavItem | NavGroup;

function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "children" in entry;
}

const TRACKING_CHILDREN: NavItem[] = [
  { key: "liveTracking", icon: Radio, href: "/live" },
  { key: "detailedTracking", icon: MapPin, href: "/detailed" },
  { key: "salesTracking", icon: ShoppingCart, href: "/sales" },
  { key: "historyTracking", icon: History, href: "/history" },
  { key: "liveRoute", icon: Route, href: "/live-route" },
  { key: "multiTracking", icon: Truck, href: "/multi" },
  { key: "heatmap", icon: Flame, href: "/heatmap" },
];

function useNavEntries() {
  const visibleVehicleModules = useVisibleModules(VM_MODULES);

  const vehicleChildren: NavItem[] = visibleVehicleModules.map((m) => ({
    key: m.key,
    icon: m.icon,
    href: m.href,
  }));

  const entries: NavEntry[] = [
    { key: "dashboard", icon: Home, href: "/dashboard" },
    {
      key: "track",
      icon: Navigation,
      children: TRACKING_CHILDREN,
    },
    { key: "alerts", icon: Bell, phase: 4 },
    { key: "reports", icon: BarChart3, phase: 5 },
    { key: "geofences", icon: CircleDashed, phase: 4 },
    { key: "fleet", icon: Truck, phase: 2 },
    ...(vehicleChildren.length > 0
      ? [
          {
            key: "vehicles",
            icon: CarFront,
            namespace: "masters.vm.modules",
            children: vehicleChildren,
          } satisfies NavGroup,
        ]
      : []),
    { key: "accounts", icon: UserCog, href: "/masters/account-management" },
    { key: "settings", icon: Settings, phase: 1 },
  ];

  return entries;
}

function NavLink({ item, stacked, onNavigate }: { item: NavItem; stacked?: boolean; onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
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
      <span className={active ? undefined : compactLabel}>{t(item.key)}</span>
    </Link>
  );
}

/** Dropdown group for the horizontal nav bar. */
function NavDropdown({ group }: { group: NavGroup }) {
  const tNav = useTranslations("nav");
  const tGroup = useTranslations(group.namespace ?? "nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isGroupActive =
    group.children.some(
      (child) => child.href && (pathname === child.href || pathname.startsWith(`${child.href}/`)),
    ) ||
    (group.key === "vehicles" &&
      (pathname === "/masters/vehicle-management" || pathname.startsWith("/masters/vehicle-management/")));

  function handleMouseEnter() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  }

  function handleMouseLeave() {
    timeoutRef.current = setTimeout(() => setOpen(false), 120);
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className={cn(
          "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-[13px] font-medium transition-[background-color,color,box-shadow] [&_svg]:size-4 [&_svg]:shrink-0",
          isGroupActive
            ? "bg-primary-soft text-primary shadow-[0_6px_16px_-6px_rgb(11_110_105/0.45)]"
            : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
        )}
      >
        <group.icon aria-hidden />
        <span className="max-[1679px]:sr-only">{tNav(group.key)}</span>
        <ChevronDown
          aria-hidden
          className={cn("size-3.5 transition-transform duration-150", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={tNav(group.key)}
          className="absolute start-0 top-full z-30 mt-1.5 min-w-[220px] overflow-hidden rounded-xl border border-border/70 bg-surface shadow-panel backdrop-blur-xl"
        >
          <ul className="grid max-h-[min(480px,calc(100vh-5rem))] gap-0.5 overflow-y-auto p-1.5">
            {group.children.map((child) => {
              const active =
                !!child.href && (pathname === child.href || pathname.startsWith(`${child.href}/`));
              return (
                <li key={child.key} role="none">
                  <Link
                    href={child.href ?? "/"}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-[background-color,color] [&_svg]:size-4 [&_svg]:shrink-0",
                      active
                        ? "bg-primary-soft text-primary font-semibold"
                        : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                    )}
                  >
                    <child.icon aria-hidden />
                    {tGroup(child.key)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Stacked (sheet) version of a group for mobile. */
function NavGroupStacked({ group, onNavigate }: { group: NavGroup; onNavigate?: () => void }) {
  const tNav = useTranslations("nav");
  const tGroup = useTranslations(group.namespace ?? "nav");
  const pathname = usePathname();
  const isGroupActive =
    group.children.some(
      (child) => child.href && (pathname === child.href || pathname.startsWith(`${child.href}/`)),
    ) ||
    (group.key === "vehicles" &&
      (pathname === "/masters/vehicle-management" || pathname.startsWith("/masters/vehicle-management/")));
  const [open, setOpen] = useState(isGroupActive);

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-[background-color,color] [&_svg]:size-4 [&_svg]:shrink-0",
          isGroupActive
            ? "bg-primary-soft text-primary"
            : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
        )}
      >
        <group.icon aria-hidden />
        {tNav(group.key)}
        <ChevronDown
          aria-hidden
          className={cn("ms-auto size-3.5 transition-transform duration-150", open && "rotate-180")}
        />
      </button>
      {open && (
        <ul className="ms-4 mt-0.5 grid gap-0.5 border-s border-border/50 ps-3">
          {group.children.map((child) => {
            const active =
              !!child.href && (pathname === child.href || pathname.startsWith(`${child.href}/`));
            return (
              <li key={child.key}>
                <Link
                  href={child.href ?? "/"}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-[background-color,color] [&_svg]:size-4 [&_svg]:shrink-0",
                    active
                      ? "bg-primary-soft text-primary font-semibold"
                      : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                  )}
                >
                  <child.icon aria-hidden />
                  {tGroup(child.key)}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/** Horizontal main navigation; collapses into a side sheet below `xl`. */
export function TopNav() {
  const t = useTranslations("nav");
  const entries = useNavEntries();
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav aria-label={t("main")} className="hidden min-w-0 xl:block">
        <ul className="flex items-center gap-0.5">
          {entries.map((entry) =>
            isNavGroup(entry) ? (
              <li key={entry.key}>
                <NavDropdown group={entry} />
              </li>
            ) : (
              <li key={entry.key}>
                <NavLink item={entry} />
              </li>
            ),
          )}
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
            {entries.map((entry) =>
              isNavGroup(entry) ? (
                <NavGroupStacked key={entry.key} group={entry} onNavigate={() => setOpen(false)} />
              ) : (
                <li key={entry.key}>
                  <NavLink item={entry} stacked onNavigate={() => setOpen(false)} />
                </li>
              ),
            )}
          </ul>
        </nav>
      </Sheet>
    </>
  );
}
