"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ApiRequestError } from "@/lib/graphql/client";
import type { ApiErrorKind } from "@/lib/graphql/errors";
import { fetchLatest, fetchTrail } from "@/lib/multi-tracking/api";
import {
  applyFixes,
  emptyTrack,
  MAX_GRID,
  mergeHistory,
  parseSaved,
  POLL_MS,
  toggleVehicle,
  type Fix,
  type PreloadMinutes,
  type SavedState,
  type Track,
  type ViewMode,
} from "@/lib/multi-tracking/core";

export type FeedPhase = "idle" | "live" | "paused" | "retrying" | "failed";
export type Notice = "gridLimit" | "singleLimit" | "tooManyForGrid";

export type FeedState = {
  selected: string[];
  view: ViewMode;
  preload: PreloadMinutes;
  /** Mutated in place; `version` bumps whenever any track changes. */
  tracks: ReadonlyMap<string, Track>;
  version: number;
  /** Vehicles whose trail preload is still loading. */
  preloading: ReadonlySet<string>;
  phase: FeedPhase;
  lastPollAt: number | null;
  error: ApiErrorKind | null;
  notice: { kind: Notice; at: number } | null;
  /** The saved selection has been read (avoids flashing the empty state on load). */
  restored: boolean;
};

const FATAL: ReadonlySet<string> = new Set(["unauthenticated", "forbidden", "validation", "api_locked"]);
const BACKOFF_MS = [15_000, 30_000, 60_000];
/** Rapid ticks are batched into one poll. */
const SELECTION_SETTLE_MS = 250;

const INITIAL: FeedState = {
  selected: [],
  view: "grid",
  preload: 15,
  tracks: new Map(),
  version: 0,
  preloading: new Set(),
  phase: "idle",
  lastPollAt: null,
  error: null,
  notice: null,
  restored: false,
};

/**
 * Multi Tracking's live feed (plan §7 A). One `deviceLastPositionsForVehicles` request per cycle
 * for every selected vehicle; pauses while the tab is hidden and polls immediately on return;
 * stops entirely when nothing is selected or the page unmounts. The selection, view and
 * preload choice are saved per user in localStorage (no server-side selection API yet).
 */
export class MultiTrackFeed {
  private state: FeedState = INITIAL;
  private listeners = new Set<() => void>();
  private tracks = new Map<string, Track>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private polling = false;
  private paused = false;
  private failures = 0;
  private disposed = false;
  /** Bumps on every selection change: a poll that started for an older selection is ignored. */
  private generation = 0;

  constructor(private readonly storageKey: string) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.state;
  getServerSnapshot = () => INITIAL;

  private set(patch: Partial<FeedState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  private bump() {
    this.set({ version: this.state.version + 1 });
  }

  private persist() {
    const { selected, view, preload } = this.state;
    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify({ ids: selected, view, preload } satisfies SavedState));
    } catch {
      // Storage blocked: the selection just isn't remembered.
    }
  }

  /** Reads the saved selection (first start only), then polls it. Safe to call again after stop. */
  start() {
    this.disposed = false;
    document.addEventListener("visibilitychange", this.onVisibility);
    if (this.state.restored) {
      if (this.state.selected.length) this.schedule(0);
      return;
    }
    let saved: SavedState | null = null;
    try {
      saved = parseSaved(window.localStorage.getItem(this.storageKey));
    } catch {
      saved = null;
    }
    this.set({ restored: true, ...(saved ? { view: saved.view, preload: saved.preload } : {}) });
    if (saved?.ids.length) this.select(saved.ids, new Map());
  }

  /** Stops all polling (page left). */
  stop() {
    this.disposed = true;
    clearTimeout(this.timer);
    document.removeEventListener("visibilitychange", this.onVisibility);
  }

  /** Ticks/unticks one vehicle; `seed` is its lastPosition from the list, shown at once. */
  toggle(id: string, seed: Fix | null) {
    const r = toggleVehicle(this.state.selected, id, this.state.view);
    if (r.blocked) {
      this.set({ notice: { kind: r.blocked, at: Date.now() } });
      return;
    }
    this.select(r.selected, new Map(seed ? [[id, seed]] : []));
  }

  clearAll() {
    this.select([], new Map());
  }

  /** Drops vehicles the user can no longer see (deleted, or no longer assigned to them). */
  remove(ids: string[]) {
    const next = this.state.selected.filter((id) => !ids.includes(id));
    if (next.length !== this.state.selected.length) this.select(next, new Map());
  }

  setView(view: ViewMode) {
    if (view === this.state.view) return;
    if (view === "grid" && this.state.selected.length > MAX_GRID) {
      this.set({ notice: { kind: "tooManyForGrid", at: Date.now() } });
      return;
    }
    this.set({ view });
    this.persist();
  }

  setPreload(preload: PreloadMinutes) {
    this.set({ preload });
    this.persist();
  }

  dismissNotice() {
    this.set({ notice: null });
  }

  /** Re-runs the cycle now (the Retry button after a fatal error). */
  retry() {
    this.failures = 0;
    this.set({ error: null, phase: this.state.selected.length ? "live" : "idle" });
    this.schedule(0);
  }

  private select(next: string[], seeds: Map<string, Fix>) {
    const added = next.filter((id) => !this.tracks.has(id));
    for (const id of [...this.tracks.keys()]) if (!next.includes(id)) this.tracks.delete(id);
    for (const id of added) {
      const t = emptyTrack();
      const seed = seeds.get(id);
      if (seed) applyFixes(t, [seed]);
      this.tracks.set(id, t);
    }
    this.generation++;
    this.set({ selected: next, tracks: this.tracks, notice: null, version: this.state.version + 1 });
    this.persist();
    if (this.state.preload > 0) for (const id of added) void this.preload(id, this.state.preload);
    if (next.length === 0) {
      clearTimeout(this.timer);
      this.set({ phase: "idle", error: null });
      return;
    }
    if (this.state.phase === "idle") this.set({ phase: "live" });
    this.schedule(SELECTION_SETTLE_MS);
  }

  private async preload(id: string, minutes: number) {
    this.set({ preloading: new Set([...this.state.preloading, id]) });
    try {
      const history = await fetchTrail(id, minutes);
      const track = this.tracks.get(id);
      if (!track || this.disposed) return;
      mergeHistory(track, history);
      this.bump();
    } catch {
      // A missing preload only means the trail starts at the first live point.
    } finally {
      const rest = new Set(this.state.preloading);
      rest.delete(id);
      if (!this.disposed) this.set({ preloading: rest });
    }
  }

  private schedule(ms: number) {
    clearTimeout(this.timer);
    if (this.disposed) return;
    this.timer = setTimeout(() => void this.poll(), ms);
  }

  private async poll() {
    if (this.disposed || this.polling || this.state.selected.length === 0) return;
    if (document.hidden) {
      this.paused = true;
      this.set({ phase: "paused" });
      return; // resumed by onVisibility
    }
    this.polling = true;
    const generation = this.generation;
    const ids = this.state.selected;
    try {
      const latest = await fetchLatest(ids);
      if (this.disposed) return;
      let changed = false;
      for (const [id, fix] of latest) {
        const track = this.tracks.get(id);
        if (track && applyFixes(track, [fix])) changed = true;
      }
      this.failures = 0;
      this.set({
        lastPollAt: Date.now(),
        error: null,
        phase: document.hidden ? "paused" : "live",
        ...(changed ? { version: this.state.version + 1 } : {}),
      });
      if (document.hidden) this.paused = true;
      else this.schedule(generation === this.generation ? POLL_MS : 0);
    } catch (err) {
      if (this.disposed) return;
      const kind: ApiErrorKind = err instanceof ApiRequestError ? err.error.kind : "unknown";
      if (FATAL.has(kind)) {
        this.set({ error: kind, phase: "failed" });
        return;
      }
      this.set({ error: kind, phase: "retrying" });
      this.schedule(BACKOFF_MS[Math.min(this.failures++, BACKOFF_MS.length - 1)]);
    } finally {
      this.polling = false;
    }
  }

  private onVisibility = () => {
    if (this.disposed || this.state.selected.length === 0 || this.state.phase === "failed") return;
    if (document.hidden) {
      clearTimeout(this.timer);
      this.paused = true;
      if (!this.polling) this.set({ phase: "paused" });
    } else if (this.paused) {
      this.paused = false;
      void this.poll();
    }
  };
}

/** One feed per page visit, keyed by user so two accounts on one browser don't mix selections. */
export function useMultiTrackFeed(userKey: string) {
  const [feed] = useState(() => new MultiTrackFeed(`kt.multi-tracking.${userKey}`));
  const state = useSyncExternalStore(feed.subscribe, feed.getSnapshot, feed.getServerSnapshot);
  useEffect(() => {
    feed.start();
    return () => feed.stop();
  }, [feed]);
  return { ...state, feed };
}
