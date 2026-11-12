"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CheckCheck, ExternalLink, MapPin, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useRouter } from "@/i18n/navigation";
import { formatInCompanyTz, useCompanyTimeZone } from "@/lib/company-time";
import { gqlRequest } from "@/lib/graphql/client";
import { notificationKind, requestLiveFocus, type AppNotification } from "@/lib/notifications/api";
import { useMarkRead } from "@/lib/notifications/use-notifications";
import { can, useMe } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { KIND_STYLE, useNotificationText, useRelativeTime } from "./notification-content";

/** Acknowledging an alert: the backend sets acknowledgedBy to the caller (S1). */
const ACKNOWLEDGE_ALERT = /* GraphQL */ `
  mutation AcknowledgeAlertEvent($id: ID!, $acknowledgedAt: String!) {
    updateAlertEvent(id: $id, acknowledgedAt: $acknowledgedAt) {
      id
      acknowledgedAt
    }
  }
`;

/** Now as an API time: UTC "YYYY-MM-DD HH:MM:SS". */
function apiNow(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Details of one notification in a side panel: what happened, which vehicle and geofence, when,
 * where, speed and battery, and its status. From here: open the vehicle on the live map, mark it
 * read (inbox), or acknowledge it (alerts, with the alerts.edit permission).
 *
 * `source`: "inbox" for the backend's per-user notifications, "alert" for the company's alert
 * events shown until the inbox exists.
 */
export function NotificationDetailSheet({
  n,
  source,
  onClose,
}: {
  n: AppNotification | null;
  source: "inbox" | "alert";
  onClose: () => void;
}) {
  const t = useTranslations("notifications");
  const tDetail = useTranslations("notifications.detail");
  const text = useNotificationText();
  const relative = useRelativeTime();
  const zone = useCompanyTimeZone();
  const router = useRouter();
  const queryClient = useQueryClient();
  const markRead = useMarkRead();
  const { data: me } = useMe();
  const [acknowledging, setAcknowledging] = useState(false);
  // The panel's own copy of the read state, so it updates right after acknowledging.
  const [acknowledgedAt, setAcknowledgedAt] = useState<string | null>(null);

  if (!n) return null;

  const kind = notificationKind(n);
  const style = KIND_STYLE[kind];
  const Icon = style.icon;
  const { title, body } = text(n);
  const at = n.details.occurredAt ?? n.createdAt;
  const readAt = acknowledgedAt ?? n.readAt;
  const d = n.details;
  const hasPlace = d.lat !== null && d.lng !== null;
  const canAcknowledge = source === "alert" && !readAt && !!n.alertEventId && can(me, "alerts", "edit");

  const openOnMap = () => {
    if (!d.vehicleId) return;
    if (source === "inbox" && !n.readAt) markRead.mutate(n.id);
    requestLiveFocus(d.vehicleId);
    onClose();
    router.push("/live");
  };

  const acknowledge = async () => {
    if (!n.alertEventId) return;
    setAcknowledging(true);
    try {
      const stamp = apiNow();
      await gqlRequest(ACKNOWLEDGE_ALERT, { id: n.alertEventId, acknowledgedAt: stamp });
      setAcknowledgedAt(stamp);
      await queryClient.invalidateQueries({ queryKey: ["alerts"] });
      toast.success(tDetail("acknowledgedToast"));
    } catch {
      toast.error(tDetail("acknowledgeFailed"));
    } finally {
      setAcknowledging(false);
    }
  };

  const status =
    source === "alert"
      ? readAt
        ? { label: tDetail("statusAcknowledged"), tone: "bg-surface-2 text-muted-foreground" }
        : { label: tDetail("statusOpen"), tone: "bg-idle/15 text-idle" }
      : readAt
        ? { label: tDetail("statusRead"), tone: "bg-surface-2 text-muted-foreground" }
        : { label: tDetail("statusUnread"), tone: "bg-primary-soft text-primary" };

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
      description={tDetail("subtitle")}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {source === "inbox" && !readAt ? (
            <Button variant="secondary" onClick={() => markRead.mutate(n.id)} disabled={markRead.isPending}>
              <CheckCheck />
              {t("markRead")}
            </Button>
          ) : null}
          {canAcknowledge ? (
            <Button variant="secondary" onClick={() => void acknowledge()} disabled={acknowledging}>
              <ShieldCheck />
              {acknowledging ? tDetail("acknowledging") : tDetail("acknowledge")}
            </Button>
          ) : null}
          {d.vehicleId ? (
            <Button onClick={openOnMap}>
              <MapPin />
              {t("openOnMap")}
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="grid gap-5">
        <div className={cn("flex items-start gap-3 rounded-2xl border-s-4 bg-surface-2/60 p-4", style.edge)}>
          <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl [&_svg]:size-5", style.tone)}>
            <Icon className="rtl:-scale-x-100" aria-hidden />
          </span>
          <div className="grid min-w-0 gap-1">
            <p className="text-sm font-semibold">{title}</p>
            {body ? <p className="text-sm text-muted-foreground">{body}</p> : null}
            <span className={cn("mt-1 w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold", status.tone)}>
              {status.label}
            </span>
          </div>
        </div>

        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
          <Row label={tDetail("event")}>{title}</Row>
          <Row label={tDetail("vehicle")}>
            <span dir="ltr" className="font-semibold">
              {d.plateNo ?? (d.vehicleId ? `#${d.vehicleId}` : "—")}
            </span>
          </Row>
          {d.geofenceName || d.geofenceId ? (
            <Row label={tDetail("geofence")}>{d.geofenceName ?? `#${d.geofenceId}`}</Row>
          ) : null}
          <Row label={tDetail("time")}>
            <span dir="ltr">{formatInCompanyTz(at, zone, "dd MMM yyyy, hh:mm:ss a")}</span>
            {relative(at) ? <span className="text-muted-foreground"> · {relative(at)}</span> : null}
          </Row>
          {d.address ? <Row label={tDetail("address")}>{d.address}</Row> : null}
          <Row label={tDetail("location")}>
            {hasPlace ? (
              <a
                href={`https://www.google.com/maps?q=${d.lat},${d.lng}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-mono text-primary hover:underline"
                dir="ltr"
              >
                {d.lat!.toFixed(5)}, {d.lng!.toFixed(5)}
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : (
              "—"
            )}
          </Row>
          {d.speed !== null ? (
            <Row label={tDetail("speed")}>
              <span dir="ltr">{tDetail("speedValue", { speed: Math.round(d.speed) })}</span>
            </Row>
          ) : null}
          {d.externalVoltageMv !== null ? (
            <Row label={tDetail("battery")}>
              <span dir="ltr">{(d.externalVoltageMv / 1000).toFixed(1)} V</span>
            </Row>
          ) : null}
          {readAt ? (
            <Row label={source === "alert" ? tDetail("acknowledgedAt") : tDetail("readAt")}>
              <span dir="ltr">{formatInCompanyTz(readAt, zone, "dd MMM yyyy, hh:mm a")}</span>
            </Row>
          ) : null}
          <Row label={tDetail("reference")}>
            <span className="font-mono text-xs text-muted-foreground" dir="ltr">
              {n.alertEventId ? `#${n.alertEventId}` : n.id}
            </span>
          </Row>
        </dl>
      </div>
    </Sheet>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}
