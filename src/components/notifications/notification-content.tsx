"use client";

import { Bell, LogIn, LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { formatInCompanyTz, useCompanyTimeZone } from "@/lib/company-time";
import {
  notificationKind,
  requestLiveFocus,
  type AppNotification,
  type NotificationKind,
} from "@/lib/notifications/api";
import { useMarkRead } from "@/lib/notifications/use-notifications";
import { cn } from "@/lib/utils";
import { parseApiDateTime } from "@/lib/vehicle-management/helpers";

/** Icon, colour and wording per kind: green for entering, grey for leaving, amber for anything else. */
export const KIND_STYLE: Record<NotificationKind, { icon: typeof Bell; tone: string; dot: string; edge: string }> = {
  enter: { icon: LogIn, tone: "bg-moving/12 text-moving", dot: "bg-moving", edge: "border-s-moving" },
  exit: {
    icon: LogOut,
    tone: "bg-surface-3 text-muted-foreground",
    dot: "bg-muted-foreground",
    edge: "border-s-border-strong",
  },
  other: { icon: Bell, tone: "bg-idle/15 text-idle", dot: "bg-idle", edge: "border-s-idle" },
};

/** The notification's headline and sentence, from the event details, else the API's own text. */
export function useNotificationText() {
  const t = useTranslations("notifications");
  return (n: AppNotification): { title: string; body: string } => {
    const kind = notificationKind(n);
    const plate = n.details.plateNo ?? t("someVehicle");
    const geofence = n.details.geofenceName ?? t("someGeofence");
    // Name the area in the headline when the alert carries it ("Entered Warehouse Ahmedabad").
    const named = n.details.geofenceName;
    if (kind === "enter")
      return named
        ? { title: t("enteredNamed", { geofence: named }), body: t("enteredThis", { plate }) }
        : { title: t("enteredTitle"), body: t("entered", { plate, geofence }) };
    if (kind === "exit")
      return named
        ? { title: t("exitedNamed", { geofence: named }), body: t("exitedThis", { plate }) }
        : { title: t("exitedTitle"), body: t("exited", { plate, geofence }) };
    return { title: n.title || t("alertTitle"), body: n.body };
  };
}

/** "5 min ago" in the page language; null for unparsable times. */
export function useRelativeTime() {
  const locale = useLocale();
  return (value: string | null | undefined): string | null => {
    const date = parseApiDateTime(value ?? null);
    if (!date) return null;
    const seconds = Math.round((date.getTime() - Date.now()) / 1000);
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const abs = Math.abs(seconds);
    if (abs < 60) return rtf.format(seconds, "second");
    if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
    if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), "hour");
    return rtf.format(Math.round(seconds / 86_400), "day");
  };
}

/**
 * Opening a notification: marks it read and shows its vehicle on the Live map. The vehicle is
 * handed over through this tab's storage, so the URL stays clean.
 */
export function useOpenNotification() {
  const router = useRouter();
  const markRead = useMarkRead();
  return (n: AppNotification) => {
    if (!n.readAt) markRead.mutate(n.id);
    if (n.details.vehicleId) {
      requestLiveFocus(n.details.vehicleId);
      router.push("/live");
    }
  };
}

/** One notification: kind icon, headline, sentence, time. Used by the bell, the toast and the history. */
export function NotificationSummary({ n, compact = false }: { n: AppNotification; compact?: boolean }) {
  const text = useNotificationText();
  const relative = useRelativeTime();
  const zone = useCompanyTimeZone();
  const kind = notificationKind(n);
  const style = KIND_STYLE[kind];
  const { title, body } = text(n);
  const at = n.details.occurredAt ?? n.createdAt;
  const Icon = style.icon;

  return (
    <div className="flex min-w-0 items-start gap-3 text-start">
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-xl [&_svg]:size-4",
          compact ? "size-9" : "size-10",
          style.tone,
        )}
      >
        <Icon className="rtl:-scale-x-100" aria-hidden />
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex items-center gap-2">
          <span className={cn("truncate text-[13px]", n.readAt ? "font-medium" : "font-semibold text-foreground")}>
            {title}
          </span>
          {!n.readAt ? <span className={cn("size-2 shrink-0 rounded-full", style.dot)} aria-hidden /> : null}
        </span>
        {body ? (
          <span className={cn("text-[13px] text-muted-foreground", compact && "line-clamp-2")}>{body}</span>
        ) : null}
        <span className="text-[11px] text-subtle" dir="ltr">
          {formatInCompanyTz(at, zone, "dd MMM, hh:mm a")}
          {relative(at) ? ` · ${relative(at)}` : ""}
        </span>
      </span>
    </div>
  );
}
