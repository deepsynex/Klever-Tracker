/**
 * Audit log helpers (API Doc §6.13). `oldValues` / `newValues` are JSON-encoded strings (the API has
 * no JSON scalar); either can be null (a create has no old values, a delete no new ones).
 */

export type AuditChange = { field: string; before: string; after: string };

function parse(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const v = JSON.parse(value);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : { value: v };
  } catch {
    return { value };
  }
}

function show(v: unknown): string {
  if (v === undefined) return "";
  if (v === null) return "null";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Fields whose value differs between before and after, in a stable (alphabetical) order. */
export function auditChanges(oldValues: string | null | undefined, newValues: string | null | undefined): AuditChange[] {
  const before = parse(oldValues);
  const after = parse(newValues);
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return fields
    .map((field) => ({ field, before: show(before[field]), after: show(after[field]) }))
    .filter((c) => c.before !== c.after);
}

/** "App\\Models\\Vehicle" → "Vehicle" (the API stores Laravel class names). */
export function auditSubject(type: string | null | undefined): string {
  if (!type) return "";
  return type.split(/[\\/]/).pop() ?? type;
}

/** "AlertRule" (or "App\Models\AlertRule") → "Alert rule", for the Record column. */
export function subjectLabel(type: string | null | undefined): string {
  const name = auditSubject(type);
  const words = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : "";
}

/**
 * A readable name for the record from the entry's own values (name, plate, title, email…), for
 * when it can't be looked up (e.g. it was deleted since).
 */
export function nameFromValues(newValues: string | null | undefined, oldValues: string | null | undefined): string | null {
  for (const values of [newValues, oldValues]) {
    const v = parse(values);
    for (const key of ["name", "plateNo", "plate_no", "title", "email", "username"]) {
      const value = v[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}

/** Entries saved together (one save that changed several records) are at most this far apart. */
export const AUDIT_GROUP_WINDOW_MS = 10_000;

type Groupable = { id: string; userId: string | null; companyId: string | null; createdAt: string };

/**
 * Groups entries made by one save into one row: same user, same company, each within
 * AUDIT_GROUP_WINDOW_MS of the previous one. `entries` must be newest first; groups keep that order.
 */
export function groupAuditEntries<E extends Groupable>(entries: E[], toMs: (createdAt: string) => number, windowMs = AUDIT_GROUP_WINDOW_MS): E[][] {
  const groups: E[][] = [];
  for (const e of entries) {
    const group = groups[groups.length - 1];
    const prev = group?.[group.length - 1];
    if (prev && prev.userId === e.userId && prev.companyId === e.companyId && Math.abs(toMs(prev.createdAt) - toMs(e.createdAt)) <= windowMs) {
      group.push(e);
    } else {
      groups.push([e]);
    }
  }
  return groups;
}
