"use client";

import { Bell, CheckCheck, ListX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import type { AppNotification } from "@/lib/notifications/api";
import { useDismissedNotifications } from "@/lib/notifications/dismissed";
import {
  useMarkAllRead,
  useMarkRead,
  useNotificationList,
  useUnreadCount,
} from "@/lib/notifications/use-notifications";
import { useOpenAlerts } from "@/lib/notifications/use-open-alerts";
import { useMe } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { NotificationSummary } from "./notification-content";
import { NotificationDetailSheet } from "./notification-detail";
import { SwipeToDismiss } from "./swipe-to-dismiss";

/**
 * Bell in the top bar, always shown: a count badge and a dropdown with the latest 10.
 *
 * With the backend's per-user inbox (G3) it lists notifications (unread count, mark read). Until
 * then it falls back to the company's alerts (alertEvents): the badge counts open alerts (not
 * acknowledged or resolved). Esc or an outside click closes it.
 *
 * Like a phone's notification shade, an item can be swiped left or right (or closed with x, or all
 * at once with "Clear all") to remove it from this panel. It stays on the Notifications page; an
 * inbox notification is also marked read. Removed ids are remembered per user in this browser.
 */
export function NotificationBell() {
  const t = useTranslations("notifications");
  const inbox = useUnreadCount();
  const alertsMode = !inbox.available && !inbox.isPending;
  const alerts = useOpenAlerts({ enabled: alertsMode });
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  // More than the 10 shown, so the panel refills as items are swiped away.
  const list = useNotificationList({ first: 30, enabled: open && inbox.available });
  const markAll = useMarkAllRead();
  const markRead = useMarkRead();
  const [detail, setDetail] = useState<AppNotification | null>(null);
  const { data: me } = useMe();
  const { dismissed, dismiss } = useDismissedNotifications(me?.id ?? null);
  // Inbox: unread count (removing marks read). Alerts: open alerts still in the panel.
  const count = inbox.available ? inbox.count : alerts.items.filter((n) => !n.readAt && !dismissed.has(n.id)).length;

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const all = inbox.available ? (list.data?.items ?? []) : alerts.items;
  const items = all.filter((n) => !dismissed.has(n.id)).slice(0, 10);
  const cleared = all.length > 0 && items.length === 0;

  const remove = (n: AppNotification) => {
    if (!alertsMode && !n.readAt) markRead.mutate(n.id);
    dismiss(n.id);
  };
  const clearAll = () => {
    if (!alertsMode && items.some((n) => !n.readAt)) markAll.mutate();
    dismiss(all.map((n) => n.id));
  };
  const pending = inbox.available ? list.isPending : alertsMode && alerts.isPending;
  const failed = inbox.available ? list.isError : false;
  const badge = count > 99 ? "99+" : String(count);
  const countLabel = alertsMode ? t("bellAlerts", { count }) : t("bellUnread", { count });

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={count > 0 ? countLabel : t("bell")}
        title={t("bell")}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "relative grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground",
          open && "bg-surface-2 text-foreground",
        )}
      >
        <Bell className="size-[18px]" aria-hidden />
        {count > 0 ? (
          <span className="absolute -end-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white ring-2 ring-surface">
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          className="absolute end-0 top-full z-30 mt-2 flex w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border/70 bg-surface shadow-xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
            <h2 className="text-sm font-semibold">{alertsMode ? t("alertsTitle") : t("title")}</h2>
            <div className="flex items-center gap-1">
              {alertsMode ? (
                <span className="px-2 text-xs text-muted-foreground">{t("openAlerts", { count })}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => markAll.mutate()}
                  disabled={count === 0 || markAll.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary-soft disabled:pointer-events-none disabled:opacity-40"
                >
                  <CheckCheck className="size-3.5" aria-hidden />
                  {t("markAllRead")}
                </button>
              )}
              <button
                type="button"
                onClick={clearAll}
                disabled={items.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                <ListX className="size-3.5" aria-hidden />
                {t("swipe.clearAll")}
              </button>
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {pending ? (
              <div className="grid gap-2 p-4" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-2" />
                ))}
              </div>
            ) : failed ? (
              <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">{t("loadFailed")}</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                {cleared ? t("swipe.allCleared") : alertsMode ? t("emptyAlerts") : t("empty")}
              </p>
            ) : (
              <ul className="divide-y divide-border/50">
                {items.map((n) => (
                  <li key={n.id}>
                    <SwipeToDismiss
                      onOpen={() => {
                        // Show its details; opening an inbox notification marks it read.
                        setOpen(false);
                        if (!alertsMode && !n.readAt) markRead.mutate(n.id);
                        setDetail(n);
                      }}
                      onDismiss={() => remove(n)}
                      dismissLabel={t("swipe.remove")}
                      className={cn(
                        "bg-surface px-4 py-3 pe-10 hover:bg-surface-2/70",
                        !n.readAt && "bg-primary-soft/40",
                      )}
                    >
                      <NotificationSummary n={n} compact />
                    </SwipeToDismiss>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {items.length > 0 ? <p className="px-4 pb-2 text-center text-[11px] text-subtle">{t("swipe.hint")}</p> : null}
          {/* The page lists notifications, or the company's alerts until the inbox exists. */}
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="border-t border-border/70 px-4 py-2.5 text-center text-[13px] font-semibold text-primary hover:bg-surface-2/70"
          >
            {t("viewAll")}
          </Link>
        </div>
      ) : null}
      <NotificationDetailSheet
        key={detail?.id ?? "none"}
        n={detail}
        source={alertsMode ? "alert" : "inbox"}
        onClose={() => setDetail(null)}
      />
    </div>
  );
}
