"use client";

import { useQuery } from "@tanstack/react-query";
import { gqlRequest } from "@/lib/graphql/client";
import { GET_POSITION_HISTORY, type PositionHistoryResult } from "@/lib/graphql/operations";
import { parseApiDateTime } from "@/lib/vehicle-management/helpers";
import { IDLE_DEFAULTS, excessiveIdle, type IdleFix } from "./detector";

/**
 * Vehicles idling too long right now (engine on, standing still past their idle limit), for the
 * live map's Excessive Idling panel. Until the backend has its own idling API, it's worked out
 * here: last positions pick the vehicles that might be idling (fresh, ignition on, ≤ 5 km/h),
 * and only those have their recent points read and checked with the idle rules.
 */

const IDLING_VEHICLES = /* GraphQL */ `
  query IdlingVehicles {
    vehicles(first: 500) {
      data {
        id
        plateNo
        vehicleName
        idleLimitMinutes
      }
    }
    deviceLastPositions(first: 500) {
      data {
        vehicleId
        recordedAt
        ignition
        speed
      }
    }
  }
`;
type IdlingVehiclesResult = {
  vehicles: { data: Array<{ id: string; plateNo: string; vehicleName: string | null; idleLimitMinutes: number | null }> };
  deviceLastPositions: { data: Array<{ vehicleId: string | null; recordedAt: string; ignition: boolean | null; speed: number | null }> };
};

/** Points read per candidate: enough for a long idle at the tracker's slow idle reporting rate. */
const HISTORY_POINTS = 300;
export const IDLING_REFRESH_MS = 30_000;

export type IdlingVehicle = {
  vehicleId: string;
  plateNo: string;
  vehicleName: string | null;
  /** Device time the idle started (epoch ms). */
  since: number;
  /** Idle started before the oldest point read: idle at least this long. */
  atLeast: boolean;
  lat: number;
  lng: number;
};

export function useExcessiveIdling() {
  return useQuery({
    queryKey: ["idling", "live"],
    refetchInterval: IDLING_REFRESH_MS,
    staleTime: IDLING_REFRESH_MS / 2,
    queryFn: async (): Promise<IdlingVehicle[]> => {
      const now = Date.now();
      const { vehicles, deviceLastPositions } = await gqlRequest<IdlingVehiclesResult>(IDLING_VEHICLES);
      const byId = new Map(vehicles.data.map((v) => [v.id, v]));
      const candidates = deviceLastPositions.data.filter((p) => {
        const at = parseApiDateTime(p.recordedAt)?.getTime() ?? 0;
        return p.vehicleId && byId.has(p.vehicleId) && p.ignition === true && (p.speed ?? 0) <= IDLE_DEFAULTS.idleSpeedKmh && now - at <= IDLE_DEFAULTS.staleMs;
      });
      const found = await Promise.all(
        candidates.map(async (p) => {
          const v = byId.get(p.vehicleId!)!;
          const history = await gqlRequest<PositionHistoryResult>(GET_POSITION_HISTORY, { vehicleId: v.id, first: HISTORY_POINTS });
          // The API lists newest first; the rules read them in time order.
          const fixes: IdleFix[] = history.positionHistory.data
            .flatMap((h) => {
              const at = parseApiDateTime(h.recordedAt)?.getTime();
              return at && h.locationLat != null && h.locationLng != null
                ? [{ at, ignition: h.ignition ?? null, speed: h.speed ?? 0, lat: h.locationLat, lng: h.locationLng }]
                : [];
            })
            .reverse();
          const idle = excessiveIdle(fixes, now, { thresholdMinutes: v.idleLimitMinutes ?? IDLE_DEFAULTS.thresholdMinutes });
          return idle ? { vehicleId: v.id, plateNo: v.plateNo, vehicleName: v.vehicleName, since: idle.since, atLeast: idle.atLeast, lat: idle.lat, lng: idle.lng } : null;
        }),
      );
      // Longest idle first.
      return found.filter((x): x is IdlingVehicle => x !== null).sort((a, b) => a.since - b.since);
    },
  });
}
