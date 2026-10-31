"use client";

import { Activity, ArrowRight, Flame, History, Layers, Radio, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { PageHeader, StatusBadge } from "@/components/masters/page-header";
import { Link } from "@/i18n/navigation";

interface TrackingScreenProps {
  translationKey: "live" | "detailed" | "sales" | "liveRoute" | "multi";
  icon: LucideIcon;
  phase?: number;
}

export function TrackingScreen({ translationKey, icon: Icon, phase = 3 }: TrackingScreenProps) {
  const t = useTranslations(`tracking.${translationKey}`);
  const tc = useTranslations("nav");

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title={t("title")} description={t("description")} />
        <StatusBadge tone="info">
          {tc("phase", { n: phase })} • {tc("comingSoon", { n: phase })}
        </StatusBadge>
      </div>

      <div className="relative overflow-hidden rounded-card border border-border/70 bg-surface p-6 shadow-panel backdrop-blur-xl sm:p-8">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="relative mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary-soft text-primary shadow-sm">
            <Icon className="size-8" aria-hidden />
            <span className="absolute -end-1 -top-1 flex size-3">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex size-3 rounded-full bg-primary" />
            </span>
          </div>

          <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">{t("description")}</p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/history"
              className="inline-flex items-center gap-2 rounded-lg bg-surface-2 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-3"
            >
              <History className="size-4 text-primary" aria-hidden />
              <span>{tc("historyShort")}</span>
              <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
            </Link>
            <Link
              href="/heatmap"
              className="inline-flex items-center gap-2 rounded-lg bg-surface-2 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-3"
            >
              <Flame className="size-4 text-sand" aria-hidden />
              <span>{tc("heatmap")}</span>
              <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 border-t border-border/50 pt-6 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-xl bg-surface-2/60 p-3.5">
            <Radio className="size-5 text-primary" aria-hidden />
            <div className="grid text-start">
              <span className="text-xs text-muted-foreground">GPS Stream</span>
              <span className="text-sm font-semibold">Live Polling</span>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-surface-2/60 p-3.5">
            <Activity className="size-5 text-moving" aria-hidden />
            <div className="grid text-start">
              <span className="text-xs text-muted-foreground">Fleet Telemetry</span>
              <span className="text-sm font-semibold">Ready for Phase {phase}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-surface-2/60 p-3.5">
            <Layers className="size-5 text-accent" aria-hidden />
            <div className="grid text-start">
              <span className="text-xs text-muted-foreground">Map Rendering</span>
              <span className="text-sm font-semibold">Google Maps JS API</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
