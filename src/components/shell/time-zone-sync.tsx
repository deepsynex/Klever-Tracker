"use client";

import { Fragment, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useMe } from "@/lib/permissions";
import {
  effectiveTimeZone,
  getTimeZoneGeneration,
  readTimeZonePreference,
  setDisplayTimeZone,
  subscribeTimeZone,
} from "@/lib/time-zone";

/**
 * Puts the app in the right display time zone: the user's own choice (My profile), else their
 * company's, else the default. The client starts in the zone it last used (lib/time-zone.ts), so
 * normally nothing changes here. When the zone does change (first visit, a new choice in My
 * profile, a company time-zone change) the screen below re-renders once so every time on it,
 * including ones from plain formatting helpers, is redrawn in the new zone.
 */
export function TimeZoneSync({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const userId = me?.id ?? null;
  const pref = useSyncExternalStore(
    subscribeTimeZone,
    () => (userId ? readTimeZonePreference(userId) : "company"),
    () => "company",
  );
  // Changes only when the zone really changes after load (not on hydration), so a normal page
  // load keeps everything the user already picked.
  const generation = useSyncExternalStore(subscribeTimeZone, getTimeZoneGeneration, () => 0);
  // Only once the user (and so their choice and company zone) is known: before that, keep the
  // zone the client started in rather than flipping to the default and back.
  const target = me ? effectiveTimeZone(pref, me.company?.timezone) : null;

  useEffect(() => {
    if (target) setDisplayTimeZone(target);
  }, [target]);

  return <Fragment key={generation}>{children}</Fragment>;
}
