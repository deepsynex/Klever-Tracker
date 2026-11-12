"use client";

import { useQuery } from "@tanstack/react-query";
import { gqlRequest } from "@/lib/graphql/client";
import {
  GET_ALERT_EVENTS,
  GET_EVENT_TYPES,
  GET_VEHICLES,
  type AlertEventsResult,
  type EventTypesResult,
  type VehiclesResult,
} from "@/lib/graphql/operations";
import type { AppNotification } from "./api";
import { alertToNotification, isOpenAlert, newestFirst } from "./alerts";

/** How often the alert fallback refreshes. */
const ALERTS_POLL_MS = 60_000;
/** The newest alerts the bell looks at; the badge counts the open ones among them. */
const ALERTS_WINDOW = 100;

/**
 * The company's newest alerts (alertEvents, live today) for the bell while the backend has no
 * per-user inbox (G3). `available` is false when the user may not read alerts.
 */
export function useOpenAlerts({ enabled }: { enabled: boolean }): {
  available: boolean;
  isPending: boolean;
  count: number;
  items: AppNotification[];
} {
  const q = useQuery({
    queryKey: ["alerts", "bell"],
    enabled,
    queryFn: async () => {
      const [events, types, vehicles] = await Promise.all([
        gqlRequest<AlertEventsResult>(GET_ALERT_EVENTS, { first: ALERTS_WINDOW, page: 1 }),
        gqlRequest<EventTypesResult>(GET_EVENT_TYPES).catch(() => null),
        gqlRequest<VehiclesResult>(GET_VEHICLES, { first: 500 }).catch(() => null),
      ]);
      const typeById = new Map((types?.eventTypes.data ?? []).map((t) => [t.id, t]));
      const plateById = new Map((vehicles?.vehicles.data ?? []).map((v) => [v.id, v.plateNo]));
      const list = events.alertEvents.data;
      return {
        count: list.filter(isOpenAlert).length,
        items: newestFirst(list.map((a) => alertToNotification(a, typeById, plateById))),
      };
    },
    refetchInterval: ALERTS_POLL_MS,
    staleTime: 30_000,
    retry: false,
  });
  return {
    available: q.isSuccess,
    isPending: q.isPending,
    count: q.data?.count ?? 0,
    items: q.data?.items ?? [],
  };
}
