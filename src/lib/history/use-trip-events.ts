"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";
import type { AlertEventItem, EventTypeItem } from "@/lib/graphql/operations";
import type { HistoryFix } from "./fetch-history";
import { deriveIgnitionEvents, fromAlertEvents, IGNITION_OFF, IGNITION_ON, mergeTripEvents, type TripEvent } from "./trip-events";

/**
 * The History window's trip events: stored alert events, plus ignition on/off worked out from the
 * track when the backend has none for the window (older data, or no ignition alert rule), filtered
 * to the chosen event type ("all" for every type).
 */
export function useTripEvents(
  apiEvents: AlertEventItem[],
  fixes: HistoryFix[],
  eventTypes: EventTypeItem[],
  eventTypeId: string,
): { all: TripEvent[]; shown: TripEvent[] } {
  const all = useMemo(
    () => mergeTripEvents(fromAlertEvents(apiEvents, eventTypes), deriveIgnitionEvents(fixes, eventTypes)),
    [apiEvents, fixes, eventTypes],
  );
  const shown = useMemo(() => all.filter((ev) => eventTypeId === "all" || ev.eventTypeId === eventTypeId), [all, eventTypeId]);
  return { all, shown };
}

/**
 * Display name for a trip event: translated for ignition events, the event type's name otherwise.
 * Stable between renders (the map redraws its markers when it changes).
 */
export function useEventLabel(eventTypes: EventTypeItem[]): (code: string, eventTypeId: string | null) => string {
  const t = useTranslations("history.events");
  return useCallback(
    (code: string, eventTypeId: string | null) =>
      code === IGNITION_ON
        ? t("ignitionOn")
        : code === IGNITION_OFF
          ? t("ignitionOff")
          : (eventTypes.find((e) => e.id === eventTypeId)?.name ?? code),
    [t, eventTypes],
  );
}
