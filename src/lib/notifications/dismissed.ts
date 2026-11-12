"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Notifications swiped away from the bell panel, remembered per user in this browser (like a
 * phone's notification shade). They only leave the panel: the Notifications page still lists them.
 * Kept in localStorage, so it survives reloads; trimmed to the newest MAX_IDS ids.
 */

const MAX_IDS = 500;
const keyFor = (userId: string) => `kt-dismissed-notifications:${userId}`;
const listeners = new Set<() => void>();
const EMPTY: ReadonlySet<string> = new Set();
let cache: { key: string; raw: string | null; set: ReadonlySet<string> } | null = null;

function read(userId: string | null): ReadonlySet<string> {
  if (!userId || typeof window === "undefined") return EMPTY;
  const key = keyFor(userId);
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return EMPTY;
  }
  // Same snapshot object while nothing changed (useSyncExternalStore needs a stable value).
  if (cache && cache.key === key && cache.raw === raw) return cache.set;
  let ids: string[] = [];
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) ids = parsed.filter((x): x is string => typeof x === "string");
  } catch {
    ids = [];
  }
  cache = { key, raw, set: new Set(ids) };
  return cache.set;
}

function write(userId: string, ids: string[]) {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(ids.slice(-MAX_IDS)));
  } catch {
    // Storage full or blocked: the item just comes back after a reload.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith("kt-dismissed-notifications:")) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The ids removed from the bell for this user, and functions to remove one or many. */
export function useDismissedNotifications(userId: string | null) {
  const dismissed = useSyncExternalStore(
    subscribe,
    () => read(userId),
    () => EMPTY,
  );
  const dismiss = useCallback(
    (ids: string | string[]) => {
      if (!userId) return;
      const current = [...read(userId)];
      const add = (Array.isArray(ids) ? ids : [ids]).filter((id) => !current.includes(id));
      if (add.length) write(userId, [...current, ...add]);
    },
    [userId],
  );
  return { dismissed, dismiss };
}

/** Whether a horizontal drag of `dx` px (over `ms`) on an item `width` px wide should remove it. */
export function isSwipeAway(dx: number, width: number, ms: number): boolean {
  const distance = Math.abs(dx);
  if (width > 0 && distance >= width * 0.35) return true;
  // A quick flick: at least 40 px at more than 0.5 px/ms.
  return distance >= 40 && ms > 0 && distance / ms > 0.5;
}
