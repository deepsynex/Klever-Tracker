/**
 * Notification rules shown as one row per vehicle (or vehicle group, or all vehicles). The API
 * stores one alert per rule, so a row is every rule of a company with the same target; saving a
 * row updates, creates or deletes those rules so there's exactly one per chosen alert.
 */
import type { AlertRule } from "@/lib/graphql/alert-rules";

export type RuleTarget = { companyId: string; vehicleId: string | null; vehicleGroupId: string | null };

export type RuleRow = RuleTarget & {
  /** Same for every rule of the row: see targetKey. */
  key: string;
  /** The key again, for tables that need an id per row. */
  id: string;
  rules: AlertRule[];
};

/** One key per company + target: a vehicle, a vehicle group, or the whole company. */
export function targetKey(t: RuleTarget): string {
  return `${t.companyId}|${t.vehicleId ? `v${t.vehicleId}` : t.vehicleGroupId ? `g${t.vehicleGroupId}` : "all"}`;
}

/** Rules grouped into rows, in first-seen order. */
export function groupRules(rules: AlertRule[]): RuleRow[] {
  const rows = new Map<string, RuleRow>();
  for (const r of rules) {
    const target = { companyId: r.companyId, vehicleId: r.vehicleId, vehicleGroupId: r.vehicleGroupId };
    const key = targetKey(target);
    const row = rows.get(key) ?? { ...target, key, id: key, rules: [] };
    row.rules.push(r);
    rows.set(key, row);
  }
  return [...rows.values()];
}

/** The row's alerts (event type ids), once each, in the rules' order. */
export const rowAlerts = (row: RuleRow): string[] => [...new Set(row.rules.map((r) => r.eventTypeId))];

/**
 * What saving a row means for its rules: update one existing rule per chosen alert (and delete
 * any duplicate for the same alert), create a rule for each new alert, delete rules for alerts
 * that were unticked.
 */
export function planRowSave(existing: AlertRule[], alerts: string[]): { update: AlertRule[]; create: string[]; remove: string[] } {
  const byAlert = new Map<string, AlertRule[]>();
  for (const r of existing) byAlert.set(r.eventTypeId, [...(byAlert.get(r.eventTypeId) ?? []), r]);
  const chosen = new Set(alerts);
  const update: AlertRule[] = [];
  const create: string[] = [];
  const remove: string[] = [];
  for (const id of alerts) {
    const [first, ...duplicates] = byAlert.get(id) ?? [];
    if (first) update.push(first);
    else create.push(id);
    remove.push(...duplicates.map((r) => r.id));
  }
  for (const r of existing) if (!chosen.has(r.eventTypeId)) remove.push(r.id);
  return { update, create, remove };
}

/** Whether the row's rules differ in how and to whom they notify (saving the row makes them the same). */
export function rowSettingsDiffer(row: RuleRow): boolean {
  const sig = (r: AlertRule) =>
    JSON.stringify([
      r.isActive,
      r.notifyInApp,
      r.notifyEmail,
      r.notifyPush,
      r.minRepeatIntervalMinutes ?? null,
      r.recipients.map((x) => `${x.recipientType}:${x.userId ?? x.email?.toLowerCase() ?? ""}:${x.isCc ? 1 : 0}`).sort(),
    ]);
  return new Set(row.rules.map(sig)).size > 1;
}
