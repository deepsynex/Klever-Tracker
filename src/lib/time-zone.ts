/**
 * The time zone every timestamp is shown (and every date/time input read) in.
 *
 * The API speaks UTC. People read times in: their own choice (My profile), else their company's
 * time zone (`me.company.timezone`), else DEFAULT_TIME_ZONE. The server renders with the default;
 * the client starts in the zone it last used and TimeZoneSync corrects it if that changed. Kept
 * in a module-level store so plain formatting helpers (no React) use it too.
 */
export const DEFAULT_TIME_ZONE = "Asia/Dubai";

const LAST_KEY = "kt.time-zone.last";
let zone = DEFAULT_TIME_ZONE;
/** Bumps only when the zone actually changes after load: the app re-renders on it (TimeZoneSync). */
let generation = 0;
const listeners = new Set<() => void>();

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// Start the client in the zone it last used, so a normal page load needs no switch (and no
// re-render that would reset what the user already did on the page).
if (typeof window !== "undefined") {
  try {
    const last = window.localStorage.getItem(LAST_KEY);
    if (last && isValidTimeZone(last)) zone = last;
  } catch {
    // Storage blocked: start in the default zone.
  }
}

/** The zone times are shown in right now. */
export function getDisplayTimeZone(): string {
  return zone;
}

/** Switches the display zone (ignored when invalid) and remembers it for the next load. */
export function setDisplayTimeZone(next: string): void {
  if (!isValidTimeZone(next) || next === zone) return;
  zone = next;
  generation++;
  try {
    window.localStorage.setItem(LAST_KEY, next);
  } catch {
    // Not remembered: the next load starts in the default zone and switches again.
  }
  listeners.forEach((fn) => fn());
}

/** How many times the zone has changed since load (0 on the server and on a normal load). */
export function getTimeZoneGeneration(): number {
  return generation;
}

export function subscribeTimeZone(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** "company" = follow the company's zone; otherwise an IANA zone name. */
export type TimeZonePreference = "company" | string;

const prefKey = (userId: string) => `kt.time-zone.${userId}`;

export function readTimeZonePreference(userId: string): TimeZonePreference {
  try {
    const v = window.localStorage.getItem(prefKey(userId));
    return v && (v === "company" || isValidTimeZone(v)) ? v : "company";
  } catch {
    return "company";
  }
}

export function writeTimeZonePreference(userId: string, pref: TimeZonePreference): void {
  try {
    if (pref === "company") window.localStorage.removeItem(prefKey(userId));
    else window.localStorage.setItem(prefKey(userId), pref);
  } catch {
    // Storage blocked: the choice applies until the page reloads.
  }
  listeners.forEach((fn) => fn());
}

/** Which zone applies: the personal choice, else the company's, else the default. */
export function effectiveTimeZone(pref: TimeZonePreference, companyZone: string | null | undefined): string {
  if (pref !== "company" && isValidTimeZone(pref)) return pref;
  if (companyZone && isValidTimeZone(companyZone)) return companyZone;
  return DEFAULT_TIME_ZONE;
}

/**
 * Browsers list some zones under their old IANA names (Chrome: "Asia/Calcutta", no "Asia/Kolkata").
 * Both names convert identically; pickers show the current one.
 */
const MODERN_NAMES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Europe/Kiev": "Europe/Kyiv",
  "Africa/Asmera": "Africa/Asmara",
  "America/Godthab": "America/Nuuk",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
};

/** The current IANA name for a zone (old aliases renamed). */
export function modernTimeZone(value: string): string {
  return MODERN_NAMES[value] ?? value;
}

/** Zones most of our customers use, offered first. */
export const COMMON_TIME_ZONES = [
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Riyadh",
  "Asia/Qatar",
  "Asia/Kuwait",
  "Asia/Bahrain",
  "Asia/Muscat",
  "Asia/Karachi",
  "Africa/Cairo",
  "Europe/London",
  "UTC",
];

/** Every IANA zone the browser knows (current names, sorted, no duplicates), for pickers. */
export function allTimeZones(): string[] {
  const listed =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [DEFAULT_TIME_ZONE, "UTC"];
  const names = new Set(listed.map(modernTimeZone).filter(isValidTimeZone));
  for (const z of COMMON_TIME_ZONES) if (isValidTimeZone(z)) names.add(z);
  return [...names].sort();
}

function zonePart(value: string, style: "longOffset" | "long", at: Date): string {
  return (
    new Intl.DateTimeFormat("en", { timeZone: value, timeZoneName: style })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value ?? ""
  );
}

/** "Asia/Kolkata — India Standard Time (UTC+05:30)" */
export function timeZoneLabel(value: string, at: Date = new Date()): string {
  try {
    const name = modernTimeZone(value);
    const raw = zonePart(value, "longOffset", at);
    const offset = raw === "GMT" ? "UTC+00:00" : raw.replace("GMT", "UTC");
    const long = zonePart(value, "long", at);
    // Skip the long name when it's just the offset again ("GMT+05:30") or the zone itself.
    const friendly = long && !/^GMT|^UTC$|Coordinated Universal Time/.test(long) ? ` — ${long}` : "";
    return offset ? `${name}${friendly} (${offset})` : name;
  } catch {
    return value;
  }
}
