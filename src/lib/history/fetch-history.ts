import { gqlRequest } from "@/lib/graphql/client";
import { GET_ALERT_EVENTS, type AlertEventItem, type AlertEventsResult, type PositionHistoryPoint } from "@/lib/graphql/operations";
import { parseApiDateTime } from "@/lib/vehicle-management/helpers";

/**
 * Every fix in a History window, oldest first. `positionHistory` returns newest first in pages,
 * so a single `first: 1000` call silently dropped the start of any window with more than 1000
 * fixes (VERIFY-1 sends ~1 per minute: under a day). Page 1 gives the total; the rest are fetched
 * a few at a time. `ignition` is included for stop detection (clean-track.ts).
 */
export const HISTORY_POSITIONS = /* GraphQL */ `
  query HistoryPositions($vehicleId: ID, $deviceId: ID, $from: String, $to: String, $first: Int, $page: Int) {
    positionHistory(vehicleId: $vehicleId, deviceId: $deviceId, from: $from, to: $to, first: $first, page: $page) {
      data {
        deviceId
        recordedAt
        locationLat
        locationLng
        speed
        heading
        ignition
      }
      paginatorInfo {
        total
        lastPage
      }
    }
  }
`;

export type HistoryFix = PositionHistoryPoint & { heading?: number | null; ignition?: boolean | null };

const PAGE_SIZE = 1000;
const CONCURRENCY = 4;
/** About a month at one fix a minute; beyond this the browser would struggle to draw it. */
export const MAX_HISTORY_FIXES = 50_000;

export class TooManyFixesError extends Error {
  constructor(public readonly total: number) {
    super(`${total} fixes`);
    this.name = "TooManyFixesError";
  }
}

type Page = { positionHistory: { data: HistoryFix[]; paginatorInfo?: { total?: number; lastPage?: number } } };

export async function fetchHistoryFixes(
  filter: { vehicleId: string } | { deviceId: string },
  from: string,
  to: string,
): Promise<HistoryFix[]> {
  const page = (n: number) => gqlRequest<Page>(HISTORY_POSITIONS, { ...filter, from, to, first: PAGE_SIZE, page: n });
  const first = await page(1);
  const total = first.positionHistory.paginatorInfo?.total ?? first.positionHistory.data.length;
  if (total > MAX_HISTORY_FIXES) throw new TooManyFixesError(total);

  const lastPage = Math.max(1, first.positionHistory.paginatorInfo?.lastPage ?? Math.ceil(total / PAGE_SIZE));
  const rows = [...first.positionHistory.data];
  const queue = Array.from({ length: lastPage - 1 }, (_, k) => k + 2);
  const worker = async () => {
    while (queue.length) rows.push(...(await page(queue.shift()!)).positionHistory.data);
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

  // Oldest first, parsed as UTC (the API's timestamps have no zone; `new Date()` would read them as local).
  const time = (p: HistoryFix) => parseApiDateTime(p.recordedAt)?.getTime() ?? 0;
  rows.sort((a, b) => time(a) - time(b));
  // One fix per device and time, even if a page boundary repeated a row.
  return rows.filter((p, k) => k === 0 || p.recordedAt !== rows[k - 1].recordedAt || p.deviceId !== rows[k - 1].deviceId);
}

const EVENT_PAGE_SIZE = 500;
const MAX_EVENT_PAGES = 10;

/**
 * A vehicle's alert events in a History window (UTC bounds), every page up to 5,000 events.
 * Uses the backend's alertEvents(vehicleId, from, to) filter.
 */
export async function fetchAlertEvents(vehicleId: string, from: string, to: string): Promise<AlertEventItem[]> {
  const rows: AlertEventItem[] = [];
  for (let page = 1; page <= MAX_EVENT_PAGES; page++) {
    const res = await gqlRequest<AlertEventsResult>(GET_ALERT_EVENTS, { vehicleId, from, to, first: EVENT_PAGE_SIZE, page });
    rows.push(...res.alertEvents.data);
    if (page >= (res.alertEvents.paginatorInfo?.lastPage ?? 1)) break;
  }
  return rows;
}

/**
 * fetchAlertEvents for History: no vehicle (a bare device) means no events, and a failure only
 * loses the stored events (track-based ignition events still show), never the history itself.
 */
export async function fetchVehicleEventsSafely(vehicleId: string | null | undefined, from: string, to: string): Promise<AlertEventItem[]> {
  if (!vehicleId) return [];
  try {
    return await fetchAlertEvents(vehicleId, from, to);
  } catch (err: unknown) {
    console.error("Failed to load trip events:", err);
    return [];
  }
}
