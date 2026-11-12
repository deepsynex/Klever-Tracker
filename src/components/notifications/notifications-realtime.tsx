"use client";

import { useQueryClient } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { gqlRequest } from "@/lib/graphql/client";
import {
  MY_NOTIFICATIONS,
  notificationKind,
  toAppNotification,
  type ApiNotification,
  type AppNotification,
  type NotificationsPage,
} from "@/lib/notifications/api";
import { connectRealtime, type NotificationBroadcast } from "@/lib/notifications/realtime";
import { invalidateNotifications, useRealtimeConnected, useUnreadCount } from "@/lib/notifications/use-notifications";
import { useMe } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { KIND_STYLE, NotificationSummary, useOpenNotification } from "./notification-content";

/** The toast for a new notification: click to open the vehicle on the Live map. */
export function NotificationToast({ n, toastId }: { n: AppNotification; toastId: string | number }) {
  const t = useTranslations("notifications");
  const openNotification = useOpenNotification();
  const style = KIND_STYLE[notificationKind(n)];
  return (
    <div
      className={cn("glass-panel w-[min(360px,calc(100vw-2rem))] rounded-2xl border-s-4 p-3.5 shadow-xl", style.edge)}
    >
      <NotificationSummary n={n} compact />
      {n.details.vehicleId ? (
        <button
          type="button"
          onClick={() => {
            toast.dismiss(toastId);
            openNotification(n);
          }}
          className="mt-2.5 ms-12 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
        >
          <MapPin className="size-3.5" aria-hidden />
          {t("openOnMap")}
        </button>
      ) : null}
    </div>
  );
}

function showToast(n: AppNotification) {
  // The notification id keeps one toast per notification, even if it arrives twice.
  toast.custom((id) => <NotificationToast n={n} toastId={id} />, { id: `notification-${n.id}`, duration: 10_000 });
}

/** A broadcast payload (G4) in the inbox's shape. */
function fromBroadcast(p: NotificationBroadcast): AppNotification | null {
  if (p.id == null) return null;
  const api: ApiNotification = {
    id: String(p.id),
    alertEventId: p.alertEventId != null ? String(p.alertEventId) : null,
    title: p.title ?? "",
    body: p.body ?? "",
    data: p.data ?? null,
    readAt: p.readAt ?? null,
    createdAt: p.createdAt ?? new Date().toISOString().slice(0, 19).replace("T", " "),
  };
  return toAppNotification(api);
}

/**
 * Mounted once in the signed-in shell. With Reverb configured, listens on the user's private
 * channel and toasts each new notification at once. Without it (or while the socket is down),
 * the bell's 30-second unread poll is the signal: when the count goes up, the newest unread
 * notifications not toasted yet are shown.
 */
export function NotificationsRealtime() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { count, available } = useUnreadCount();
  const live = useRealtimeConnected();
  const seen = useRef(new Set<string>());
  const previousCount = useRef<number | null>(null);

  const userId = me?.id ?? null;
  useEffect(() => {
    if (!userId || !available) return;
    return connectRealtime(userId, (payload) => {
      void invalidateNotifications(qc);
      const n = fromBroadcast(payload);
      if (!n || seen.current.has(n.id)) return;
      seen.current.add(n.id);
      showToast(n);
    });
  }, [userId, available, qc]);

  useEffect(() => {
    if (!available) return;
    const before = previousCount.current;
    previousCount.current = count;
    // The first count only sets the baseline: old unread notifications aren't toasted on load.
    if (before === null || count <= before || live) return;
    const fresh = count - before;
    void gqlRequest<NotificationsPage>(MY_NOTIFICATIONS, { unreadOnly: true, first: Math.min(fresh, 5), page: 1 })
      .then((res) => {
        void invalidateNotifications(qc);
        for (const raw of res.myNotifications.data) {
          if (seen.current.has(raw.id)) continue;
          seen.current.add(raw.id);
          showToast(toAppNotification(raw));
        }
      })
      .catch(() => {
        // A missed toast isn't worth an error: the bell still shows the notification.
      });
  }, [count, available, live, qc]);

  return null;
}
