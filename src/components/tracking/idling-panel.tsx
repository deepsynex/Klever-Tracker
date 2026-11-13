"use client";

import { Timer, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { formatIdle } from "@/lib/idling/detector";
import type { IdlingVehicle } from "@/lib/idling/use-excessive-idling";
import { cn } from "@/lib/utils";

/**
 * The live map's "Excessive Idling" panel (Vehicle No | Idle Since | Location), longest idle
 * first. The list refreshes every 30 s; the timers tick every second here. Clicking a row follows
 * that vehicle on the map.
 */
export function IdlingPanel({
  vehicles,
  loading,
  selectedId,
  onSelect,
  onClose,
}: {
  vehicles: IdlingVehicle[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (vehicleId: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("tracking.live.idling");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section
      aria-label={t("title")}
      className={cn(
        "absolute z-10 flex flex-col overflow-hidden rounded-3xl border border-border/70 bg-surface/95 p-3 text-foreground shadow-xl backdrop-blur-md",
        "inset-x-2 top-[72px] max-h-[45%] sm:inset-x-auto sm:end-4 sm:top-[104px] sm:max-h-[calc(100%-120px)] sm:w-[420px]",
      )}
    >
      <div className="flex items-center gap-2 ps-1 pb-3">
        <Timer className="size-4.5 shrink-0 text-amber-600" aria-hidden />
        <h2 className="text-sm font-bold">{t("title")}</h2>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">{vehicles.length}</span>
        <button type="button" onClick={onClose} aria-label={t("close")} className="ms-auto cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
      <p className="-mt-1 ps-1 pb-2 text-[11px] text-muted-foreground">{t("hint")}</p>

      <div className="min-h-0 overflow-y-auto rounded-xl border border-border/70 [scrollbar-width:thin]">
        <table className="w-full text-start text-xs">
          <thead className="sticky top-0 bg-surface-2 text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-start font-semibold">{t("vehicle")}</th>
              <th className="px-3 py-2 text-start font-semibold">{t("since")}</th>
              <th className="px-3 py-2 text-start font-semibold">{t("location")}</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                  {loading ? t("loading") : t("empty")}
                </td>
              </tr>
            ) : (
              vehicles.map((v) => (
                <tr
                  key={v.vehicleId}
                  tabIndex={0}
                  onClick={() => onSelect(v.vehicleId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(v.vehicleId);
                    }
                  }}
                  className={cn(
                    "cursor-pointer border-t border-border/60 outline-none hover:bg-surface-2/70 focus-visible:bg-primary-soft",
                    v.vehicleId === selectedId && "bg-primary-soft",
                  )}
                >
                  <td className="px-3 py-2 font-bold whitespace-nowrap" dir="ltr">
                    {v.plateNo}
                  </td>
                  <td className="px-3 py-2 font-mono font-semibold whitespace-nowrap text-amber-700 tabular-nums" dir="ltr" title={v.atLeast ? t("atLeast") : undefined}>
                    {v.atLeast ? "≥ " : ""}
                    {formatIdle((now - v.since) / 1000)}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground" dir="ltr">
                    {v.lat.toFixed(5)}, {v.lng.toFixed(5)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
