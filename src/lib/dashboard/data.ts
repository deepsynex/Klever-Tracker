import "server-only";
import { cache } from "react";
import { env } from "@/lib/env";
import { kleverRequest } from "@/lib/graphql/klever";
import {
  GET_ALERT_EVENTS,
  GET_DEVICES,
  GET_EVENT_TYPES,
  GET_POSITION_HISTORY,
  GET_VEHICLES,
  PING,
  type AlertEventsResult,
  type DevicesResult,
  type EventTypesResult,
  type PingResult,
  type PositionHistoryResult,
  type VehiclesResult,
} from "@/lib/graphql/operations";
import { getSessionToken } from "@/lib/session";
import { parseApiDateTime } from "@/lib/vehicle-management/helpers";

export type ApiState = "ok" | "mock" | "api_locked" | "gateway" | "network" | "unknown";
export type FleetStatus = "moving" | "stopped" | "offline";

export type FleetVehicle = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  speed: number;
  recordedAt: string;
  status: FleetStatus;
};

export type RecentAlert = { id: string; plate: string; typeName: string; typeCode: string; occurredAt: string };

export type DashboardData = {
  api: { state: ApiState; latencyMs: number | null; detail: string };
  /** System status: API answers `ping`; database answers a signed-in list query; tracking has a recent fix. Null = not checked. */
  checks: { api: boolean; database: boolean | null; tracking: boolean | null };
  totalVehicles: number | null;
  activeVehicles: number | null;
  devices: number | null;
  openAlerts: number | null;
  /** Alerts in the last 24 h against the 24 h before, in percent. Null when there's nothing to compare. */
  alertTrend: number | null;
  recentAlerts: RecentAlert[];
  fleet: FleetVehicle[];
};

/** Vehicles shown on the map preview; one `positionHistory` request each. */
const MAP_PREVIEW_LIMIT = 8;
/** A vehicle without a fix for this long counts as offline. */
const OFFLINE_AFTER_MS = 30 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

/**
 * Everything the dashboard shows, loaded once per request (`cache`) and shared by its Suspense
 * sections. Klever has no dashboard or "latest position" query, so this combines list queries and
 * a newest-first `positionHistory` page per vehicle. Any part that fails comes back empty.
 */
export const loadDashboard = cache(async (): Promise<DashboardData> => {
  const token = (await getSessionToken()) ?? undefined;
  const authed = <T>(query: string, variables: Record<string, unknown> = {}) =>
    token ? kleverRequest<T>(query, variables, { token }) : Promise.resolve(null);

  const started = performance.now();
  const pingPromise = kleverRequest<PingResult>(PING).then((r) => ({ r, ms: Math.round(performance.now() - started) }));
  const [ping, vehicles, devices, alerts, eventTypes] = await Promise.all([
    pingPromise,
    authed<VehiclesResult>(GET_VEHICLES, { first: 500 }),
    authed<DevicesResult>(GET_DEVICES, { first: 500 }),
    authed<AlertEventsResult>(GET_ALERT_EVENTS),
    authed<EventTypesResult>(GET_EVENT_TYPES),
  ]);

  const pingError = ping.r.ok ? null : ping.r.error;
  const api: DashboardData["api"] = env.mock
    ? { state: "mock", latencyMs: ping.ms, detail: ping.r.ok ? ping.r.data.ping : pingError!.message }
    : ping.r.ok
      ? { state: "ok", latencyMs: ping.ms, detail: ping.r.data.ping }
      : {
          state: (["api_locked", "gateway", "network"] as const).find((k) => k === pingError!.kind) ?? "unknown",
          latencyMs: null,
          detail: pingError!.message,
        };

  const vehicleList = vehicles?.ok ? vehicles.data.vehicles.data : [];
  const deviceList = devices?.ok ? devices.data.devices.data : [];
  const plates = new Map(vehicleList.map((v) => [v.id, v.plateNo]));

  const now = Date.now();
  const alertList = alerts?.ok ? alerts.data.alertEvents.data : [];
  const typeById = new Map((eventTypes?.ok ? eventTypes.data.eventTypes.data : []).map((e) => [e.id, e]));
  const times = alertList.map((a) => parseApiDateTime(a.occurredAt)?.getTime() ?? 0);
  const last24 = times.filter((t) => t > now - DAY_MS).length;
  const prev24 = times.filter((t) => t <= now - DAY_MS && t > now - 2 * DAY_MS).length;

  const recentAlerts = alertList
    .map((a, i) => ({ a, t: times[i] }))
    .sort((x, y) => y.t - x.t)
    .slice(0, 4)
    .map(({ a }) => ({
      id: a.id,
      plate: plates.get(a.vehicleId) ?? `#${a.vehicleId}`,
      typeName: typeById.get(a.eventTypeId)?.name ?? `#${a.eventTypeId}`,
      typeCode: typeById.get(a.eventTypeId)?.code ?? "",
      occurredAt: a.occurredAt,
    }));

  // Same fallback as tracking history: installed devices when the company has no vehicles yet.
  const targets =
    vehicleList.length > 0
      ? vehicleList.slice(0, MAP_PREVIEW_LIMIT).map((v) => ({ key: "vehicleId", id: v.id, label: v.plateNo }))
      : deviceList.slice(0, MAP_PREVIEW_LIMIT).map((d) => ({ key: "deviceId", id: d.id, label: d.imei }));
  const from = new Date(now - 7 * DAY_MS).toISOString();
  const fleet = (
    await Promise.all(
      targets.map(async (target): Promise<FleetVehicle | null> => {
        const res = await authed<PositionHistoryResult>(GET_POSITION_HISTORY, {
          [target.key]: target.id,
          from,
          first: 1,
        });
        if (!res?.ok) return null;
        // Newest first on the API; picking the latest also covers responses in any order.
        const latest = res.data.positionHistory.data
          .filter((p) => p.locationLat != null && p.locationLng != null)
          .reduce<(typeof res.data.positionHistory.data)[number] | null>(
            (best, p) => (!best || p.recordedAt > best.recordedAt ? p : best),
            null,
          );
        if (!latest) return null;
        const age = now - (parseApiDateTime(latest.recordedAt)?.getTime() ?? 0);
        const speed = Math.round(latest.speed ?? 0);
        return {
          id: `${target.key}:${target.id}`,
          label: target.label,
          lat: latest.locationLat!,
          lng: latest.locationLng!,
          speed,
          recordedAt: latest.recordedAt,
          status: age > OFFLINE_AFTER_MS && !env.mock ? "offline" : speed > 0 ? "moving" : "stopped",
        };
      }),
    )
  ).filter((v): v is FleetVehicle => v !== null);

  return {
    api,
    checks: {
      api: ping.r.ok,
      database: vehicles ? vehicles.ok : null,
      tracking: token ? fleet.some((v) => v.status !== "offline") : null,
    },
    totalVehicles: vehicles?.ok ? (vehicles.data.vehicles.paginatorInfo?.total ?? vehicleList.length) : null,
    activeVehicles: vehicles?.ok ? vehicleList.filter((v) => v.status === "active").length : null,
    devices: devices?.ok ? deviceList.length : null,
    openAlerts: alerts?.ok ? alertList.filter((a) => !a.resolvedAt).length : null,
    alertTrend: prev24 > 0 ? Math.round(((last24 - prev24) / prev24) * 100) : null,
    recentAlerts,
    fleet,
  };
});
