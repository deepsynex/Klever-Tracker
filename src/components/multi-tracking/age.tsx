"use client";

import { useTranslations } from "next-intl";
import { ageParts, formatFixTime, STALE_AFTER_MS } from "@/lib/multi-tracking/core";
import { cn } from "@/lib/utils";
import { useNow } from "./use-now";

/** "12 s ago", ticking every second; red once older than STALE_AFTER_MS. */
export function Age({ time, className }: { time: number | null; className?: string }) {
  const t = useTranslations("multiTracking.age");
  const now = useNow();
  if (time == null) return <span className={className}>{t("never")}</span>;
  if (now === 0) return <span className={className}>—</span>; // server render: the clock starts on the client
  const ms = now - time;
  const { unit, n } = ageParts(ms);
  return (
    <span className={cn(className, ms > STALE_AFTER_MS && "font-semibold text-stopped")} title={formatFixTime(time)}>
      {t(unit, { n })}
    </span>
  );
}
