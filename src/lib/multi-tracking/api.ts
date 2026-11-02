import { gqlRequest } from "@/lib/graphql/client";
import { toFix, type Fix, type LiveStatus, type RawFix } from "./core";

/**
 * Klever operations for Multi Tracking (API Doc §6.7, §6.16, §6.18, added 2026-11-02).
 * Operation names are unique so the dev mock (src/lib/graphql/mock.ts) can answer them.
 */

const LAST_POSITION_FIELDS = "status speed heading ignition locationLat locationLng recordedAt";

/** Vehicle list with live status in one call; `search` matches plate, name or registration. */
export const MULTI_TRACK_VEHICLES = /* GraphQL */ `
  query MultiTrackVehicles($search: String, $first: Int, $page: Int) {
    vehicles(search: $search, first: $first, page: $page) {
      data {
        id
        plateNo
        vehicleName
        vehicleTypeId
        lastPosition { ${LAST_POSITION_FIELDS} }
      }
      paginatorInfo {
        total
        currentPage
        lastPage
      }
    }
  }
`;

export const MULTI_TRACK_TYPES = /* GraphQL */ `
  query MultiTrackTypes($first: Int) {
    vehicleTypes(first: $first) {
      data {
        id
        name
      }
    }
  }
`;

/** The polling query: latest position for every selected vehicle, one request (max 50 ids). */
export const MULTI_TRACK_POSITIONS = /* GraphQL */ `
  query MultiTrackPositions($vehicleIds: [ID!]!) {
    deviceLastPositionsForVehicles(vehicleIds: $vehicleIds) {
      vehicleId
      ${LAST_POSITION_FIELDS}
    }
  }
`;

/** Trail preload when a tile opens (newest first, like every positionHistory call). */
export const MULTI_TRACK_TRAIL = /* GraphQL */ `
  query MultiTrackTrail($vehicleId: ID, $from: String, $to: String, $first: Int) {
    positionHistory(vehicleId: $vehicleId, from: $from, to: $to, first: $first) {
      data {
        recordedAt
        locationLat
        locationLng
        speed
        heading
        ignition
      }
    }
  }
`;

export type MultiVehicle = {
  id: string;
  plateNo: string;
  vehicleName: string | null;
  vehicleTypeId: string | null;
  lastPosition: Fix | null;
  /** Server status; "offline" when the vehicle has never reported. */
  status: LiveStatus;
};

type RawVehicle = {
  id: string;
  plateNo: string;
  vehicleName?: string | null;
  vehicleTypeId?: string | null;
  lastPosition?: RawFix | null;
};

function toVehicle(v: RawVehicle): MultiVehicle {
  const lastPosition = toFix(v.lastPosition);
  return {
    id: String(v.id),
    plateNo: v.plateNo,
    vehicleName: v.vehicleName ?? null,
    vehicleTypeId: v.vehicleTypeId != null ? String(v.vehicleTypeId) : null,
    lastPosition,
    status: lastPosition?.status ?? "offline",
  };
}

export const LIST_PAGE_SIZE = 50;

export async function fetchVehiclePage(search: string, page: number) {
  const res = await gqlRequest<{
    vehicles: { data: RawVehicle[]; paginatorInfo?: { total?: number; currentPage?: number; lastPage?: number } };
  }>(MULTI_TRACK_VEHICLES, { search: search.trim() || null, first: LIST_PAGE_SIZE, page });
  const info = res.vehicles.paginatorInfo ?? {};
  return {
    vehicles: res.vehicles.data.map(toVehicle),
    total: info.total ?? res.vehicles.data.length,
    page: info.currentPage ?? page,
    lastPage: info.lastPage ?? page,
  };
}

export async function fetchVehicleTypes(): Promise<Map<string, string>> {
  const res = await gqlRequest<{ vehicleTypes: { data: { id: string; name: string }[] } }>(MULTI_TRACK_TYPES, { first: 200 });
  return new Map(res.vehicleTypes.data.map((t) => [String(t.id), t.name]));
}

/**
 * Selected vehicles by id, in one request (aliased `vehicle(id)` fields), for restoring a saved
 * selection whose vehicles aren't on the first list page. Inaccessible ids come back null and
 * are dropped (API Doc conventions: another company's row is indistinguishable from none).
 */
export async function fetchVehiclesById(ids: string[]): Promise<MultiVehicle[]> {
  const safe = ids.filter((id) => /^\d+$/.test(id));
  if (safe.length === 0) return [];
  const fields = `id plateNo vehicleName vehicleTypeId lastPosition { ${LAST_POSITION_FIELDS} }`;
  const query = `query MultiTrackSelected { ${safe.map((id) => `v${id}: vehicle(id: ${id}) { ${fields} }`).join(" ")} }`;
  const res = await gqlRequest<Record<string, RawVehicle | null>>(query);
  return safe.map((id) => res[`v${id}`]).filter((v): v is RawVehicle => v != null).map(toVehicle);
}

/** One poll: latest fix per vehicle id. Ids the user can't see are simply missing. */
export async function fetchLatest(vehicleIds: string[]): Promise<Map<string, Fix>> {
  const res = await gqlRequest<{ deviceLastPositionsForVehicles: (RawFix & { vehicleId: string | number })[] }>(
    MULTI_TRACK_POSITIONS,
    { vehicleIds },
  );
  const out = new Map<string, Fix>();
  for (const row of res.deviceLastPositionsForVehicles ?? []) {
    const f = toFix(row);
    if (f) out.set(String(row.vehicleId), f);
  }
  return out;
}

/** Trail preload: the last `minutes` of fixes for one vehicle (capped at 500 rows). */
export async function fetchTrail(vehicleId: string, minutes: number): Promise<Fix[]> {
  const now = Date.now();
  const res = await gqlRequest<{ positionHistory: { data: RawFix[] } }>(MULTI_TRACK_TRAIL, {
    vehicleId,
    from: new Date(now - minutes * 60_000).toISOString(),
    to: new Date(now).toISOString(),
    first: 500,
  });
  return (res.positionHistory?.data ?? []).map(toFix).filter((f): f is Fix => f !== null);
}
