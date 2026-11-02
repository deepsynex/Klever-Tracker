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
