"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { gqlRequest } from "@/lib/graphql/client";
import { isMissingFromApi } from "@/lib/map-settings";
import {
  MARK_ALL_NOTIFICATIONS_READ,
  MARK_NOTIFICATION_READ,
  MY_NOTIFICATIONS,
  reverbConfig,
  toAppNotification,
  UNREAD_COUNT,
  type AppNotification,
  type NotificationsPage,
} from "./api";
import { isRealtimeConnected, subscribeRealtimeState } from "./realtime";

/**
 * The signed-in user's notification inbox (G3), read through TanStack Query. While the backend
 * doesn't have the inbox yet, `available` is false and nothing is shown.
 */

export const NOTIFICATIONS_KEY = ["notifications"] as const;
const UNREAD_KEY = [...NOTIFICATIONS_KEY, "unread"] as const;
const LIST_KEY = [...NOTIFICATIONS_KEY, "list"] as const;

/** Unread-count polling while no live socket delivers notifications. */
export const POLL_MS = 30_000;

export function useRealtimeConnected(): boolean {
  return useSyncExternalStore(subscribeRealtimeState, isRealtimeConnected, () => false);
}

export function useUnreadCount(): { count: number; available: boolean; isPending: boolean } {
  const live = useRealtimeConnected() && reverbConfig() !== null;
  const q = useQuery({
    queryKey: UNREAD_KEY,
    queryFn: async () => (await gqlRequest<{ myUnreadNotificationCount: number }>(UNREAD_COUNT)).myUnreadNotificationCount,
    // No polling over a live socket, nor while the backend lacks the inbox (it won't appear
    // mid-session; the next page load checks again).
    refetchInterval: (query) => (live || (query.state.error && isMissingFromApi(query.state.error)) ? false : POLL_MS),
    staleTime: 10_000,
    retry: false,
  });
  return {
    count: q.data ?? 0,
    // Hidden while the backend lacks the operation (schema error), and on any other failure too:
    // a broken bell is worse than no bell.
    available: q.isSuccess,
    isPending: q.isPending,
  };
}

export type NotificationList = { items: AppNotification[]; total: number; page: number; lastPage: number };

export function useNotificationList({ unreadOnly = false, page = 1, first = 10, enabled = true } = {}) {
  return useQuery({
    queryKey: [...LIST_KEY, { unreadOnly, page, first }],
    queryFn: async (): Promise<NotificationList> => {
      const res = (await gqlRequest<NotificationsPage>(MY_NOTIFICATIONS, { unreadOnly, first, page })).myNotifications;
      return {
        items: res.data.map(toAppNotification),
        total: res.paginatorInfo.total,
        page: res.paginatorInfo.currentPage,
        lastPage: Math.max(1, res.paginatorInfo.lastPage),
      };
    },
    enabled,
    placeholderData: (previous) => previous,
    staleTime: 10_000,
    retry: false,
  });
}

/** True when the inbox query failed because the backend doesn't have it yet. */
export function inboxMissing(error: unknown): boolean {
  return isMissingFromApi(error);
}

function nowApi(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

/** Marks rows read in every cached list page; returns how many were unread before. */
function markCachedRead(qc: QueryClient, match: (n: AppNotification) => boolean): number {
  let changed = 0;
  const seen = new Set<string>();
  qc.setQueriesData<NotificationList>({ queryKey: LIST_KEY }, (old) => {
    if (!old) return old;
    return {
      ...old,
      items: old.items.map((n) => {
        if (n.readAt || !match(n)) return n;
        if (!seen.has(n.id)) {
          seen.add(n.id);
          changed++;
        }
        return { ...n, readAt: nowApi() };
      }),
    };
  });
  return changed;
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => gqlRequest(MARK_NOTIFICATION_READ, { id }),
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: NOTIFICATIONS_KEY });
      const unread = qc.getQueryData<number>(UNREAD_KEY);
      const changed = markCachedRead(qc, (n) => n.id === id);
      if (typeof unread === "number" && changed > 0) qc.setQueryData(UNREAD_KEY, Math.max(0, unread - changed));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => gqlRequest(MARK_ALL_NOTIFICATIONS_READ),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: NOTIFICATIONS_KEY });
      markCachedRead(qc, () => true);
      qc.setQueryData(UNREAD_KEY, 0);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}

export function invalidateNotifications(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
}
