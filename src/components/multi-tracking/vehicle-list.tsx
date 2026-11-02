"use client";

import { Check, Loader2, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { MultiVehicle } from "@/lib/multi-tracking/api";
import {
  formatFixTime,
  MAX_GRID,
  MAX_SINGLE,
  STALE_AFTER_MS,
  trailColor,
  type LiveStatus,
  type ViewMode,
} from "@/lib/multi-tracking/core";
import { cn } from "@/lib/utils";
import { useNow } from "./use-now";
import { STATUS_COLOR } from "./track-map";
import { VehicleTypeIcon } from "./vehicle-icon";

export type ListRow = MultiVehicle & { liveStatus: LiveStatus; liveTime: number | null };

type Props = {
  rows: ListRow[];
  total: number;
  search: string;
  onSearch: (s: string) => void;
  loading: boolean;
  failed: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  selected: string[];
  view: ViewMode;
  typeName: (id: string | null) => string | null;
  onToggle: (row: ListRow) => void;
  onClearAll: () => void;
};

/** Left panel: server-side search, paged list with live status, tick to track (plan §2.2, F1–F3). */
export function VehicleList(props: Props) {
  const t = useTranslations("multiTracking");
  const { rows, selected, view } = props;
  const limit = view === "grid" ? MAX_GRID : MAX_SINGLE;

  return (
    <section className="glass-panel flex min-h-0 flex-col overflow-hidden rounded-2xl" aria-labelledby="mt-list-title">
      <div className="grid gap-2.5 border-b border-border/60 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <h2 id="mt-list-title" className="text-[13px] font-semibold">
            {t("list.title")}
          </h2>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-bold",
              selected.length >= limit ? "bg-idle/15 text-idle" : "bg-primary-soft text-primary",
            )}
            dir="ltr"
          >
            {t("list.selectedCount", { n: selected.length, max: limit })}
          </span>
        </div>
        <div className="relative">
          <Search
            className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={props.search}
            onChange={(e) => props.onSearch(e.target.value)}
            placeholder={t("list.search")}
            aria-label={t("list.search")}
            className="h-9 w-full rounded-xl border border-border/80 bg-surface/70 ps-8 pe-3 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <div
        className="flex items-center gap-2.5 border-b border-border/60 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle"
        aria-hidden
      >
        <span className="flex-1 ps-7">{t("list.asset")}</span>
        <span>{t("list.trackDate")}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5" role="list">
        {props.loading ? (
          <p className="flex items-center justify-center gap-2 p-6 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("list.loading")}
          </p>
        ) : props.failed ? (
          <p className="p-6 text-center text-xs text-destructive">{t("list.failed")}</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-center text-xs text-muted-foreground">
            {t(props.search ? "list.noMatch" : "list.empty")}
          </p>
        ) : (
          rows.map((row) => {
            const index = selected.indexOf(row.id);
            const checked = index >= 0;
            const color = STATUS_COLOR[row.liveStatus];
            return (
              <div role="listitem" key={row.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => props.onToggle(row)}
                  className={cn(
                    "group flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-start transition-colors",
                    checked ? "bg-primary-soft/80" : "hover:bg-surface-2/80",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-4.5 shrink-0 place-items-center rounded-md border transition-colors",
                      checked ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-surface",
                    )}
                    aria-hidden
                  >
                    {checked ? <Check className="size-3" strokeWidth={3} /> : null}
                  </span>
                  <span
                    className="relative grid size-8 shrink-0 place-items-center rounded-lg"
                    style={{ color, background: `color-mix(in oklab, ${color} 14%, transparent)` }}
                    title={t(`status.${row.liveStatus}`)}
                  >
                    <VehicleTypeIcon typeName={props.typeName(row.vehicleTypeId)} className="size-4" />
                    {checked && view === "single" ? (
                      <span
                        className="absolute -end-1 -top-1 size-2.5 rounded-full ring-2 ring-surface"
                        style={{ background: trailColor(index) }}
                        aria-hidden
                      />
                    ) : null}
                  </span>
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate text-[13px] font-semibold" dir="ltr">
                      {row.plateNo}
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
                      <span className="shrink-0">{t(`status.${row.liveStatus}`)}</span>
                      {row.vehicleName ? <span className="truncate">· {row.vehicleName}</span> : null}
                    </span>
                  </span>
                  <TrackDate time={row.liveTime} />
                </button>
              </div>
            );
          })
        )}
        {props.hasMore && !props.loading ? (
          <button
            type="button"
            onClick={props.onLoadMore}
            disabled={props.loadingMore}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold text-primary hover:bg-surface-2 disabled:opacity-60"
          >
            {props.loadingMore ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            {t("list.loadMore", { shown: rows.length, total: props.total })}
          </button>
        ) : null}
      </div>

      <div className="border-t border-border/60 p-2.5">
        <button
          type="button"
          onClick={props.onClearAll}
          disabled={selected.length === 0}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-border-strong/70 bg-surface/70 text-[13px] font-semibold hover:bg-surface-2 disabled:opacity-50"
        >
          <X className="size-4" aria-hidden />
          {t("list.clearAll")}
        </button>
      </div>
    </section>
  );
}

/** "02-11-2026 / 02:01:15 PM" (company time); red once the fix is stale. */
function TrackDate({ time }: { time: number | null }) {
  const t = useTranslations("multiTracking.age");
  const now = useNow();
  if (time == null) return <span className="shrink-0 text-[11px] text-subtle">{t("never")}</span>;
  const stale = now > 0 && now - time > STALE_AFTER_MS;
  return (
    <span
      className={cn(
        "grid shrink-0 text-end text-[11px] leading-tight",
        stale ? "text-stopped" : "text-muted-foreground",
      )}
      dir="ltr"
    >
      <span className="font-semibold">{formatFixTime(time, "hh:mm:ss a")}</span>
      <span className="text-[10px] opacity-80">{formatFixTime(time, "dd-MM-yyyy")}</span>
    </span>
  );
}
