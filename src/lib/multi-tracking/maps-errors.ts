/**
 * Why Google Maps refused to work, from the error Google writes to the console (it has no event
 * for quota errors). Codes from Google's "Error messages" reference for the Maps JavaScript API.
 */
export type MapsProblem = "quota" | "billing" | "key" | "load";

const RULES: [RegExp, MapsProblem][] = [
  [/Demo Key limit reached|OverQuotaMapError|daily quota|quota.*(exceeded|met)/i, "quota"],
  [/BillingNotEnabledMapError|enable Billing/i, "billing"],
  [
    /InvalidKeyMapError|RefererNotAllowedMapError|ApiNotActivatedMapError|ApiTargetBlockedMapError|ExpiredKeyMapError|MissingKeyMapError|DeletedApiProjectMapError|ProjectDeniedMapError|InvalidClientIdMapError/i,
    "key",
  ],
];

/** null when the message isn't a Google Maps failure (every other console error). */
export function classifyMapsError(message: string): MapsProblem | null {
  if (!/google|maps/i.test(message)) return null;
  for (const [re, problem] of RULES) if (re.test(message)) return problem;
  return null;
}

/** Keeps the most useful explanation when several errors arrive (quota beats a generic key error). */
export function worseProblem(a: MapsProblem | null, b: MapsProblem | null): MapsProblem | null {
  const rank: Record<MapsProblem, number> = { load: 0, key: 1, billing: 2, quota: 3 };
  if (!a) return b;
  if (!b) return a;
  return rank[b] > rank[a] ? b : a;
}
