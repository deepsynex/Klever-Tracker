import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Bell,
  CarFront,
  Clock,
  Flame,
  Gauge,
  History,
  Hourglass,
  MapPin,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { FleetMapPreview } from "@/components/dashboard/fleet-map-preview";
import { HeroIllustration } from "@/components/dashboard/hero-illustration";
import { Stagger, StaggerItem } from "@/components/dashboard/stagger";
import { Link } from "@/i18n/navigation";
import { loadDashboard, type FleetStatus } from "@/lib/dashboard/data";
import { COMPANY_TIME_ZONE } from "@/lib/history/selection";
import { getSessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { parseApiDateTime } from "@/lib/vehicle-management/helpers";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

/** Request-time data: the loader reads the session cookie and calls the API. */
async function data() {
  await connection();
  return loadDashboard();
}

function companyTime(value: string, pattern: string) {
  const date = parseApiDateTime(value);
  return date ? format(new TZDate(date.getTime(), COMPANY_TIME_ZONE), pattern) : "—";
}

export default function DashboardPage() {
  const t = useTranslations("dashboard");

  return (
    <div className="mx-auto grid max-w-[1520px] gap-5">
      <Hero />
      <Stagger className="grid gap-5">
        <div className="grid gap-5 sm:grid-cols-3">
          <Suspense fallback={<KpiSkeletons />}>
            <KpiCards />
          </Suspense>
        </div>
        <div className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
          <StaggerItem className="grid">
            <Panel
              title={
                <>
                  {t("map.title")} <span className="font-normal text-muted-foreground">{t("map.preview")}</span>
                </>
              }
              action={
                <Link
                  href="/history"
                  className="glass-panel inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold hover:text-primary"
                >
                  {t("map.open")}
                  <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
                </Link>
              }
              className="pb-2"
            >
              <Suspense fallback={<div className="h-[340px] animate-pulse rounded-xl bg-surface-2" />}>
                <FleetMap />
              </Suspense>
            </Panel>
          </StaggerItem>
          <StaggerItem className="grid">
            <Panel title={t("alerts.title")}>
              <Suspense fallback={<ListSkeleton />}>
                <RecentAlerts />
              </Suspense>
            </Panel>
          </StaggerItem>
        </div>
      </Stagger>
    </div>
  );
}

/* ───────────────────────── Hero ───────────────────────── */

function Hero() {
  const t = useTranslations("dashboard");

  return (
    <section className="relative -mx-4 -mt-6 overflow-hidden px-4 pt-10 pb-4 sm:-mx-6 sm:px-6 lg:min-h-[300px] lg:pt-12">
      {/* Isometric city on the right half of large screens; mirrored for Arabic so it stays on the end side. */}
      <div className="pointer-events-none absolute inset-y-0 end-0 hidden w-[62%] lg:block rtl:-scale-x-100">
        <HeroIllustration className="absolute inset-0 size-full" />
      </div>

      <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-2 pb-4">
          <p className="text-[15px] text-muted-foreground">{t("welcomeBack")}</p>
          <Suspense fallback={<h1 className="text-4xl font-bold tracking-tight">{t("title")}</h1>}>
            <WelcomeName />
          </Suspense>
          <p className="max-w-[60ch] text-[15px] text-muted-foreground">{t("intro")}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/history"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 text-[15px] font-semibold text-primary-foreground shadow-[0_14px_28px_-12px_rgb(11_110_105/0.8)] transition-transform hover:-translate-y-0.5 hover:bg-primary-hover"
            >
              <History className="size-[18px]" aria-hidden />
              {t("cta.history")}
            </Link>
            <Link
              href="/heatmap"
              className="glass-panel inline-flex h-12 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold transition-transform hover:-translate-y-0.5"
            >
              <BarChart3 className="size-[18px]" aria-hidden />
              {t("cta.heatmap")}
            </Link>
          </div>
        </div>
        <div className="grid lg:block">
          <Suspense fallback={<FleetStatusSkeleton />}>
            <FleetStatus />
          </Suspense>
        </div>
      </div>
    </section>
  );
}

async function WelcomeName() {
  const [user, t] = await Promise.all([getSessionUser(), getTranslations("dashboard")]);
  return <h1 className="text-4xl font-bold tracking-tight">{user?.name ?? t("title")}</h1>;
}

/** Vehicle counts by status from the dashboard's fleet (vehicles with a fix in the last 7 days). */
async function FleetStatus() {
  const [d, t] = await Promise.all([data(), getTranslations("dashboard.fleetStatus")]);
  const count = (status: FleetStatus) => d.fleet.filter((v) => v.status === status).length;
  const moving = count("moving");
  const rows = [
    { key: "moving", n: moving, tone: "text-moving", pulse: true },
    { key: "stopped", n: count("stopped"), tone: "text-idle", pulse: false },
    { key: "offline", n: count("offline"), tone: "text-stopped", pulse: false },
  ] as const;
  const latest = d.fleet.reduce<string | null>((max, v) => (!max || v.recordedAt > max ? v.recordedAt : max), null);

  return (
    <div className="glass-panel relative w-full max-w-[360px] justify-self-end rounded-2xl p-5 lg:ms-auto lg:mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">{t("title")}</h2>
        <span className={cn("flex items-center gap-1.5 text-xs font-semibold", moving > 0 ? "text-moving" : "text-muted-foreground")}>
          <span className="size-2 rounded-full bg-current" aria-hidden />
          {moving > 0 ? t("movingNow", { n: moving }) : t("noneMoving")}
        </span>
      </div>
      {d.fleet.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-3 divide-x divide-border rtl:divide-x-reverse">
            {rows.map((row) => (
              <div key={row.key} className="grid gap-1 px-3 first:ps-0 last:pe-0">
                <dt className={cn("flex items-center gap-1.5 text-xs font-medium", row.tone)}>
                  <span className="relative grid size-3 place-items-center" aria-hidden>
                    {row.pulse && row.n > 0 ? <span className="absolute size-2 rounded-full bg-current animate-ping-soft" /> : null}
                    <span className="size-2 rounded-full bg-current" />
                  </span>
                  {t(row.key)}
                </dt>
                <dd className="text-2xl font-bold tracking-tight tabular-nums">{row.n}</dd>
              </div>
            ))}
          </dl>
          {latest ? (
            <p className="mt-3 flex items-center gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
              <Clock className="size-3.5" aria-hidden />
              {t("lastFix", { time: companyTime(latest, "dd MMM, hh:mm a") })}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function FleetStatusSkeleton() {
  return (
    <div
      className="glass-panel h-[168px] w-full max-w-[360px] justify-self-end rounded-2xl lg:ms-auto lg:mt-8"
      aria-hidden
    />
  );
}

/* ───────────────────────── KPIs ───────────────────────── */

type Kpi = {
  key: string;
  icon: LucideIcon;
  tone: string;
  value: string;
  sub: string;
  badge?: { text: string; tone: string; icon?: LucideIcon };
};

async function KpiCards() {
  const [d, t] = await Promise.all([data(), getTranslations("dashboard.kpi")]);
  const activePct =
    d.totalVehicles && d.activeVehicles != null ? Math.round((d.activeVehicles / d.totalVehicles) * 100) : null;
  const n = (v: number | null) => (v == null ? "—" : v.toLocaleString("en"));

  const kpis: Kpi[] = [
    {
      key: "total",
      icon: CarFront,
      tone: "bg-moving/12 text-moving",
      value: n(d.totalVehicles),
      sub: t("totalSub"),
      badge: d.devices != null ? { text: t("devices", { n: d.devices }), tone: "bg-moving/12 text-moving" } : undefined,
    },
    {
      key: "active",
      icon: MapPin,
      tone: "bg-nogps/12 text-nogps",
      value: n(d.activeVehicles),
      sub: t("activeSub"),
      badge: activePct != null ? { text: `${activePct}%`, tone: "bg-nogps/12 text-nogps" } : undefined,
    },
    {
      key: "alerts",
      icon: Bell,
      tone: "bg-idle/15 text-idle",
      value: n(d.openAlerts),
      sub: t("alertsSub"),
      badge:
        d.alertTrend != null
          ? {
              text: `${Math.abs(d.alertTrend)}%`,
              tone: d.alertTrend > 0 ? "bg-stopped/12 text-stopped" : "bg-moving/12 text-moving",
              icon: d.alertTrend > 0 ? ArrowUp : ArrowDown,
            }
          : undefined,
    },
  ];

  return kpis.map((k) => (
    <StaggerItem key={k.key}>
      <article className="float-card flex h-full items-center gap-4 p-5 transition-transform duration-200 hover:-translate-y-1">
        <span className={cn("grid size-14 shrink-0 place-items-center rounded-2xl [&_svg]:size-7", k.tone)}>
          <k.icon aria-hidden />
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h2 className="text-[14px] font-medium text-muted-foreground">{t(k.key)}</h2>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-3xl font-bold tracking-tight" dir="ltr">
              {k.value}
            </p>
            {k.badge ? (
              <span
                className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold", k.badge.tone)}
              >
                {k.badge.icon ? (
                  <k.badge.icon className="size-3.5" aria-hidden />
                ) : (
                  <span className="size-1.5 rounded-full bg-current" />
                )}
                {k.badge.text}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-subtle">{k.sub}</p>
        </div>
      </article>
    </StaggerItem>
  ));
}

function KpiSkeletons() {
  return Array.from({ length: 3 }, (_, i) => (
    <div key={i} className="float-card h-[116px] animate-pulse" aria-hidden />
  ));
}

/* ───────────────────────── Panels ───────────────────────── */

function Panel({
  title,
  action,
  className,
  children,
}: {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("float-card flex min-w-0 flex-col gap-4 p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

async function FleetMap() {
  const d = await data();
  return <FleetMapPreview vehicles={d.fleet} />;
}

/** Alert tone by event code; Klever's codes are free text, so match on keywords. */
function alertTone(code: string): { icon: LucideIcon; tone: string } {
  if (/overspeed|speed/.test(code)) return { icon: Gauge, tone: "bg-idle/15 text-idle" };
  if (/geofence|fence/.test(code)) return { icon: MapPin, tone: "bg-info/12 text-info" };
  if (/idl|working_hours/.test(code)) return { icon: Hourglass, tone: "bg-idle/15 text-idle" };
  if (/offline|battery|stop|ignition_off/.test(code)) return { icon: Bell, tone: "bg-stopped/12 text-stopped" };
  return { icon: Flame, tone: "bg-moving/12 text-moving" };
}

async function RecentAlerts() {
  const [d, t] = await Promise.all([data(), getTranslations("dashboard.alerts")]);
  if (d.recentAlerts.length === 0) {
    return <p className="py-8 text-center text-[13px] text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <ul className="grid divide-y divide-border">
      {d.recentAlerts.map((a) => {
        const { icon: Icon, tone } = alertTone(a.typeCode);
        return (
          <li key={a.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <span className={cn("grid size-10 shrink-0 place-items-center rounded-full [&_svg]:size-[18px]", tone)}>
              <Icon aria-hidden />
            </span>
            <span className="grid min-w-0 flex-1">
              <span className="truncate text-[13px] font-bold" dir="ltr">
                {a.plate}
              </span>
              <span className="truncate text-xs text-muted-foreground">{a.typeName}</span>
            </span>
            <span className="grid shrink-0 justify-items-end text-xs text-muted-foreground" dir="ltr">
              <span>{companyTime(a.occurredAt, "hh:mm a")}</span>
              <span className="text-subtle">{companyTime(a.occurredAt, "dd MMM")}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-3" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-2" />
      ))}
    </div>
  );
}
