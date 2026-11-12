import { gqlRequest } from "@/lib/graphql/client";
import { summarisePeriod, type PeriodSummary } from "@/lib/telemetry/device-readings";

/**
 * The tracker's own totals for a History window (distance, engine time, eco score, harsh moments),
 * from the records' `attributes`. A separate, lighter request than the full history fetch: only
 * recordedAt + attributes. Up to MAX_PAGES pages; for a bigger window only the newest and oldest
 * pages are read, which still gives the distance and engine-time differences, while the eco score
 * and harsh moments cover just those pages (`partial`).
 */
const READINGS_QUERY = /* GraphQL */ `
  query HistoryReadings($vehicleId: ID, $deviceId: ID, $from: String, $to: String, $first: Int, $page: Int) {
    positionHistory(vehicleId: $vehicleId, deviceId: $deviceId, from: $from, to: $to, first: $first, page: $page) {
      data {
        recordedAt
        attributes
      }
      paginatorInfo {
        lastPage
      }
    }
  }
`;

type Page = {
  positionHistory: { data: Array<{ recordedAt: string; attributes?: string | null }>; paginatorInfo?: { lastPage?: number } };
};

const PAGE_SIZE = 1000;
const MAX_PAGES = 5;

export type WindowReadings = PeriodSummary & { partial: boolean };

/** Picks which pages to read: all of them up to `max`, else the first and the last. */
export function pagesToRead(lastPage: number, max = MAX_PAGES): { pages: number[]; partial: boolean } {
  if (lastPage <= max) return { pages: Array.from({ length: Math.max(0, lastPage - 1) }, (_, k) => k + 2), partial: false };
  return { pages: [lastPage], partial: true };
}

export async function fetchWindowReadings(
  filter: { vehicleId: string } | { deviceId: string },
  from: string,
  to: string,
): Promise<WindowReadings> {
  const page = (n: number) => gqlRequest<Page>(READINGS_QUERY, { ...filter, from, to, first: PAGE_SIZE, page: n });
  const first = await page(1);
  const { pages, partial } = pagesToRead(first.positionHistory.paginatorInfo?.lastPage ?? 1);
  const rest = await Promise.all(pages.map(page));
  const records = [first, ...rest].flatMap((p) => p.positionHistory.data);
  return { ...summarisePeriod(records), partial };
}

/** fetchWindowReadings that never fails the history: null when the readings can't be loaded. */
export async function fetchWindowReadingsSafely(
  filter: { vehicleId: string } | { deviceId: string },
  from: string,
  to: string,
): Promise<WindowReadings | null> {
  try {
    return await fetchWindowReadings(filter, from, to);
  } catch (err: unknown) {
    console.error("Failed to load tracker readings:", err);
    return null;
  }
}
