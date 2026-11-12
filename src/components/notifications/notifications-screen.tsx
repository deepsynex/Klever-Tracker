"use client";

import { Bell, BellDot, CheckCheck, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PANEL, Pager } from "@/components/masters/data-table";
import { FilterSelect, KpiCards, PageHeader } from "@/components/masters/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  inboxMissing,
  useMarkAllRead,
  useMarkRead,
  useNotificationList,
  useUnreadCount,
} from "@/lib/notifications/use-notifications";
import { useRouter } from "@/i18n/navigation";
import { requestLiveFocus, type AppNotification } from "@/lib/notifications/api";
import { useOpenAlerts } from "@/lib/notifications/use-open-alerts";
import { cn } from "@/lib/utils";
import { NotificationSummary, useOpenNotification } from "./notification-content";
import { NotificationDetailSheet } from "./notification-detail";

const PAGE_SIZES = [10, 25, 50, 100];

/** Notification history: every notification for the signed-in user, newest first, paged on the server. */
export function NotificationsScreen() {
  const t = useTranslations("notifications");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const unread = useUnreadCount();
  const all = useNotificationList({ first: 1 });
  const list = useNotificationList({ unreadOnly: filter === "unread", page: page + 1, first: pageSize });
  const markAll = useMarkAllRead();
  const markRead = useMarkRead();
  const openNotification = useOpenNotification();
  const [detail, setDetail] = useState<AppNotification | null>(null);
  /** Shows a notification's details; opening an unread one marks it read. */
  const openDetail = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate(n.id);
    setDetail(n);
  };

  // Until the backend has the per-user inbox (G3), show the company's alerts instead.
  if (list.isError && inboxMissing(list.error)) return <AlertsHistory />;

  const items = list.data?.items ?? [];
  const pageCount = list.data?.lastPage ?? 1;

  return (
    <div className="mx-auto grid max-w-[1400px] gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => markAll.mutate()} disabled={unread.count === 0 || markAll.isPending}>
            <CheckCheck />
            {t("markAllRead")}
          </Button>
        }
      />

      <KpiCards
        loading={all.isPending}
        items={[
          {
            key: "unread",
            label: t("kpi.unread"),
            value: unread.count,
            icon: <BellDot />,
            tone: unread.count > 0 ? "warn" : "ok",
          },
          { key: "total", label: t("kpi.total"), value: all.data?.total ?? 0, icon: <Bell />, tone: "primary" },
        ]}
      />

      <div className={cn(PANEL, "flex flex-wrap items-center gap-3 p-3")}>
        <FilterSelect
          label={t("filter")}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value as "all" | "unread");
            setPage(0);
          }}
        >
          <option value="all">{t("all")}</option>
          <option value="unread">{t("unreadOnly")}</option>
        </FilterSelect>
        <span className="ms-auto text-sm font-medium text-muted-foreground">
          {t("count", { count: list.data?.total ?? 0 })}
        </span>
      </div>

      <div className={cn(PANEL, "min-w-0 overflow-hidden")}>
        {list.isError ? (
          <div className="p-5">
            <Alert tone="error">{t("loadFailed")}</Alert>
          </div>
        ) : list.isPending ? (
          <div className="grid gap-3 p-5" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-2" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            {filter === "unread" ? t("noUnread") : t("empty")}
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {items.map((n) => (
              <li
                key={n.id}
                className={cn("flex flex-wrap items-center gap-3 px-5 py-3.5", !n.readAt && "bg-primary-soft/30")}
              >
                <button
                  type="button"
                  onClick={() => openDetail(n)}
                  className="min-w-0 flex-1 rounded-lg text-start hover:opacity-80"
                  aria-label={t("detail.open")}
                >
                  <NotificationSummary n={n} />
                </button>
                <div className="flex shrink-0 items-center gap-2 ps-13 sm:ps-0">
                  {!n.readAt ? (
                    <Button variant="ghost" size="sm" onClick={() => markRead.mutate(n.id)}>
                      {t("markRead")}
                    </Button>
                  ) : (
                    <span className="px-2.5 text-xs text-subtle">{t("read")}</span>
                  )}
                  {n.details.vehicleId ? (
                    <Button variant="secondary" size="sm" onClick={() => openNotification(n)}>
                      <MapPin />
                      {t("openOnMap")}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {!list.isPending && !list.isError && items.length > 0 ? (
          <Pager
            page={Math.min(page, pageCount - 1)}
            pageCount={pageCount}
            pageSize={pageSize}
            onPage={setPage}
            onPageSize={(size) => {
              setPageSize(size);
              setPage(0);
            }}
          />
        ) : null}
      </div>

      <NotificationDetailSheet key={detail?.id ?? "none"} n={detail} source="inbox" onClose={() => setDetail(null)} />
    </div>
  );
}

/**
 * The page while the backend has no notification inbox: the company's newest alerts (the same
 * list the bell shows), filterable to open ones, paged here. "Open" = not acknowledged or resolved.
 */
function AlertsHistory() {
  const t = useTranslations("notifications");
  const router = useRouter();
  const alerts = useOpenAlerts({ enabled: true });
  const [detail, setDetail] = useState<AppNotification | null>(null);
  const [filter, setFilter] = useState<"all" | "open">("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);

  const rows = filter === "open" ? alerts.items.filter((n) => !n.readAt) : alerts.items;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const visible = rows.slice(current * pageSize, current * pageSize + pageSize);
  const open = (n: AppNotification) => {
    if (!n.details.vehicleId) return;
    requestLiveFocus(n.details.vehicleId);
    router.push("/live");
  };

  return (
    <div className="mx-auto grid max-w-[1400px] gap-6">
      <PageHeader title={t("alertsTitle")} description={t("alertsDescription")} />

      <KpiCards
        loading={alerts.isPending}
        items={[
          {
            key: "open",
            label: t("kpi.open"),
            value: alerts.count,
            icon: <BellDot />,
            tone: alerts.count > 0 ? "warn" : "ok",
          },
          { key: "total", label: t("kpi.recent"), value: alerts.items.length, icon: <Bell />, tone: "primary" },
        ]}
      />

      <div className={cn(PANEL, "flex flex-wrap items-center gap-3 p-3")}>
        <FilterSelect
          label={t("filter")}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value as "all" | "open");
            setPage(0);
          }}
        >
          <option value="all">{t("all")}</option>
          <option value="open">{t("openOnly")}</option>
        </FilterSelect>
        <span className="ms-auto text-sm font-medium text-muted-foreground">{t("count", { count: rows.length })}</span>
      </div>

      <div className={cn(PANEL, "min-w-0 overflow-hidden")}>
        {!alerts.available && !alerts.isPending ? (
          <div className="p-5">
            <Alert tone="error">{t("loadFailed")}</Alert>
          </div>
        ) : alerts.isPending ? (
          <div className="grid gap-3 p-5" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-2" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            {filter === "open" ? t("noOpenAlerts") : t("emptyAlerts")}
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {visible.map((n) => (
              <li
                key={n.id}
                className={cn("flex flex-wrap items-center gap-3 px-5 py-3.5", !n.readAt && "bg-primary-soft/30")}
              >
                <button
                  type="button"
                  onClick={() => setDetail(n)}
                  className="min-w-0 flex-1 rounded-lg text-start hover:opacity-80"
                  aria-label={t("detail.open")}
                >
                  <NotificationSummary n={n} />
                </button>
                <div className="flex shrink-0 items-center gap-2 ps-13 sm:ps-0">
                  <span className={cn("px-2.5 text-xs", n.readAt ? "text-subtle" : "font-semibold text-idle")}>
                    {n.readAt ? t("acknowledged") : t("openStatus")}
                  </span>
                  {n.details.vehicleId ? (
                    <Button variant="secondary" size="sm" onClick={() => open(n)}>
                      <MapPin />
                      {t("openOnMap")}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {alerts.available && visible.length > 0 ? (
          <Pager
            page={current}
            pageCount={pageCount}
            pageSize={pageSize}
            onPage={setPage}
            onPageSize={(size) => {
              setPageSize(size);
              setPage(0);
            }}
          />
        ) : null}
      </div>

      <NotificationDetailSheet key={detail?.id ?? "none"} n={detail} source="alert" onClose={() => setDetail(null)} />
    </div>
  );
}
