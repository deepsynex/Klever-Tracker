/**
 * Audit entries for the changes made through the app (pure, so Vitest can test it). The GraphQL
 * proxy (/api/graphql) calls this after a successful mutation and saves each entry with
 * createAuditLog, because the backend audits only its own platform-settings change (request A3).
 *
 * One entry per top-level mutation field that returned a result:
 *   updateAlertRule(id: 18, isActive: true) → action "update_alert_rule", type "AlertRule", id "18",
 *   newValues {"id":"18","isActive":true}
 * Secrets in the arguments (passwords, tokens, keys) are masked.
 */
import { Kind, parse, type DocumentNode, type ValueNode } from "graphql";

export type MutationAuditEntry = {
  action: string;
  auditableType: string | null;
  auditableId: string | null;
  /** JSON of the arguments sent, secrets masked. */
  newValues: string | null;
  /** The record's company, when the mutation named one. */
  companyId: string | null;
};

/** Mutations that are sign-in / sign-out, device uploads or the audit writes themselves. */
const SKIP = new Set([
  "login",
  "loginWithGoogle",
  "logout",
  "forgotPassword",
  "resetPassword",
  "createAuditLog",
  "createUserLoginLog",
  "ingestPositions",
]);

const SECRET = /password|token|secret|apikey|api_key|privatekey/i;
const VERB = /^(create|update|delete|upsert|assign|unassign|grant|revoke|remove|add|set|mark|register|reset|change|acknowledge|resolve)(?=[A-Z])/;

/** "updateAlertRule" → "update_alert_rule". */
export const snakeCase = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

/** "updateAlertRule" → "AlertRule"; null when the name has no known verb. */
export function subjectOf(name: string): string | null {
  const m = name.match(VERB);
  if (!m) return null;
  const rest = name.slice(m[0].length);
  return rest ? rest[0].toUpperCase() + rest.slice(1) : null;
}

function valueOf(node: ValueNode, variables: Record<string, unknown>): unknown {
  switch (node.kind) {
    case Kind.VARIABLE:
      return variables[node.name.value];
    case Kind.INT:
    case Kind.FLOAT:
      return Number(node.value);
    case Kind.STRING:
    case Kind.ENUM:
      return node.value;
    case Kind.BOOLEAN:
      return node.value;
    case Kind.NULL:
      return null;
    case Kind.LIST:
      return node.values.map((v) => valueOf(v, variables));
    case Kind.OBJECT:
      return Object.fromEntries(node.fields.map((f) => [f.name.value, valueOf(f.value, variables)]));
  }
}

/** Masks secrets anywhere in the value. */
function mask(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mask);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SECRET.test(k) && v != null && v !== "" ? "[set]" : mask(v)]));
  }
  return value;
}

const idString = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : null);

export function mutationAuditEntries(
  query: string,
  variables: Record<string, unknown>,
  data: Record<string, unknown> | null | undefined,
  operationName?: string,
): MutationAuditEntry[] {
  if (!data || !/\bmutation\b/.test(query)) return [];
  let doc: DocumentNode;
  try {
    doc = parse(query);
  } catch {
    return [];
  }
  const ops = doc.definitions.filter((d) => d.kind === Kind.OPERATION_DEFINITION);
  const op = (operationName ? ops.find((o) => o.name?.value === operationName) : undefined) ?? (ops.length === 1 ? ops[0] : undefined);
  if (!op || op.operation !== "mutation") return [];

  const out: MutationAuditEntry[] = [];
  for (const sel of op.selectionSet.selections) {
    if (sel.kind !== Kind.FIELD) continue;
    const name = sel.name.value;
    if (SKIP.has(name)) continue;
    const result = data[sel.alias?.value ?? name];
    if (result === null || result === undefined || result === false) continue; // failed or nothing done
    const args = Object.fromEntries((sel.arguments ?? []).map((a) => [a.name.value, valueOf(a.value, variables)]));
    const fromResult = result && typeof result === "object" ? idString((result as Record<string, unknown>).id) : null;
    out.push({
      action: snakeCase(name),
      auditableType: subjectOf(name),
      auditableId: fromResult ?? idString(args.id),
      newValues: Object.keys(args).length ? JSON.stringify(mask(args)) : null,
      companyId: idString(args.companyId),
    });
  }
  return out;
}
