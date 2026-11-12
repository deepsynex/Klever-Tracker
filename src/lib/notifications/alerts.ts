import type { AlertEventItem, EventTypeItem } from "@/lib/graphql/operations";
import { parseApiDateTime } from "@/lib/vehicle-management/helpers";
import { toAppNotification, type AppNotification } from "./api";

/**
 * The bell's fallback until the backend has the per-user inbox (G3): the company's alert events
 * (alertEvents, live today) shown in the same rows as notifications. "Open" means neither
 * acknowledged nor resolved; an open alert counts as unread.
 */

export function isOpenAlert(a: Pick<AlertEventItem, "acknowledgedAt" | "resolvedAt">): boolean {
  return !a.acknowledgedAt && !a.resolvedAt;
}

/** One alert as a notification row: title = the event type's name, body = the vehicle. */
export function alertToNotification(
  a: AlertEventItem,
  typeById: Map<string, Pick<EventTypeItem, "name" | "code">>,
  plateById: Map<string, string>,
): AppNotification {
  let params: Record<string, unknown> = {};
  try {
    const parsed: unknown = a.parameters ? JSON.parse(a.parameters) : {};
    if (parsed && typeof parsed === "object") params = parsed as Record<string, unknown>;
  } catch {
    // Opaque string: no extra details.
  }
  const type = typeById.get(a.eventTypeId);
  const plate = plateById.get(a.vehicleId) ?? null;
  return toAppNotification({
    id: `alert-${a.id}`,
    alertEventId: a.id,
    title: type?.name ?? "",
    body: plate ?? "",
    data: {
      event_code: type?.code ?? null,
      vehicle_id: a.vehicleId,
      plate_no: plate,
      geofence_id: params.geofence_id ?? null,
      geofence_name: params.geofence_name ?? null,
      lat: params.lat ?? null,
      lng: params.lng ?? null,
      occurred_at: a.occurredAt,
      speed: params.speed ?? null,
      external_voltage_mv: params.external_voltage_mv ?? null,
      address: params.address ?? null,
    },
    readAt: a.acknowledgedAt ?? a.resolvedAt ?? null,
    createdAt: a.occurredAt,
  });
}

/** Newest first (the API's order isn't guaranteed for equal pages). */
export function newestFirst<T extends { createdAt: string }>(items: T[]): T[] {
  const time = (s: string) => parseApiDateTime(s)?.getTime() ?? 0;
  return [...items].sort((x, y) => time(y.createdAt) - time(x.createdAt));
}
