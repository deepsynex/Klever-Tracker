"use client";

import { APILoadingStatus, useApiLoadingStatus } from "@vis.gl/react-google-maps";
import { MapPinOff, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";
import { classifyMapsError, worseProblem, type MapsProblem } from "@/lib/multi-tracking/maps-errors";

/*
 * Google reports a rejected key through `gm_authFailure` (surfaced by @vis.gl as AUTH_FAILURE)
 * and a failed script load as FAILED, but quota and billing problems only as console errors.
 * This store watches console.error/warn for those messages, once per page, and remembers the
 * worst problem seen until the page reloads (a quota reset needs a reload anyway).
 */
let problem: MapsProblem | null = null;
const listeners = new Set<() => void>();
let installed = false;

function report(p: MapsProblem) {
  const next = worseProblem(problem, p);
  if (next === problem) return;
  problem = next;
  // Deferred: the error may be logged while React is rendering another component.
  queueMicrotask(() => listeners.forEach((fn) => fn()));
}

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  for (const level of ["error", "warn"] as const) {
    const original = console[level];
    console[level] = (...args: unknown[]) => {
      try {
        const text = args.map((a) => (a instanceof Error ? a.message : String(a))).join(" ");
        const p = classifyMapsError(text);
        if (p) report(p);
      } catch {
        // Never let the watcher break logging.
      }
      original.apply(console, args);
    };
  }
}

function subscribe(fn: () => void) {
  install();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The reason maps can't be shown, or null while they work. Use inside <APIProvider>. */
export function useMapsProblem(): MapsProblem | null {
  const status = useApiLoadingStatus();
  const logged = useSyncExternalStore(
    subscribe,
    () => problem,
    () => null,
  );
  const fromStatus: MapsProblem | null =
    status === APILoadingStatus.AUTH_FAILURE ? "key" : status === APILoadingStatus.FAILED ? "load" : null;
  return worseProblem(fromStatus, logged);
}

/** Problems that stop every map on the page (a quota warning can still leave maps drawing). */
export function blocksAllMaps(p: MapsProblem | null): boolean {
  return p === "key" || p === "billing" || p === "load";
}

/**
 * True once Google has replaced this particular map with its error box (`.gm-err-container`),
 * which is how a map that hit the quota (or any other failure) shows up inside its container.
 */
export function useMapElementFailed(ref: RefObject<HTMLElement | null>): boolean {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      if (el.querySelector(".gm-err-container, .gm-err-content")) {
        setFailed(true);
        observer.disconnect();
      }
    };
    const observer = new MutationObserver(check);
    observer.observe(el, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [ref]);
  return failed;
}

/** Page-level explanation: what failed, that tracking data still updates, and what to do. */
export function MapsProblemBanner({ problem: p }: { problem: MapsProblem }) {
  const t = useTranslations("multiTracking.maps");
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-[13px]"
    >
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
      <div className="grid gap-0.5">
        <p className="font-semibold">{t(`title.${p}`)}</p>
        <p className="text-muted-foreground">{t(`body.${p}`)}</p>
        <p className="text-muted-foreground">{t("stillTracking")}</p>
      </div>
    </div>
  );
}

/** Covers a map that can't render, so the user sees why instead of a blank or grey box. */
export function MapUnavailable({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("multiTracking.maps");
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-surface-2 p-3 text-center">
      <span className="grid justify-items-center gap-1.5 text-muted-foreground">
        <MapPinOff className={compact ? "size-5" : "size-7"} aria-hidden />
        <span className={compact ? "text-xs font-semibold" : "text-sm font-semibold"}>{t("unavailable")}</span>
      </span>
    </div>
  );
}
