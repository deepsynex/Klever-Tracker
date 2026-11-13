"use client";

import { useQuery } from "@tanstack/react-query";
import { BellRing, Check, Mail, Plus, RotateCcw, Trash2, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/masters/confirm-delete";
import { DataTable } from "@/components/masters/data-table";
import { isDirty, useDiscardGuard } from "@/components/masters/discard-guard";
import { FilterSelect, FormSection, KpiCards, PageHeader, StatusBadge } from "@/components/masters/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { DEFAULT_SUBJECT, fillPlaceholders } from "@/lib/alert-rules/email";
import { groupRules, planRowSave, rowAlerts, rowSettingsDiffer, targetKey, type RuleRow, type RuleTarget } from "@/lib/alert-rules/groups";
import { hasToRecipient, planRecipients, toRows, validateRows, type RecipientRow } from "@/lib/alert-rules/recipients";
import { formatInCompanyTz, useCompanyTimeZone } from "@/lib/company-time";
import { gqlRequestPartial } from "@/lib/graphql/client";
import {
  ALERT_USERS,
  alertRulesQuery,
  CREATE_ALERT_RULE,
  createRecipientMutation,
  DELETE_ALERT_RULE,
  DELETE_ALERT_RULE_RECIPIENT,
  RECIPIENT_FIELDS,
  UPDATE_ALERT_RULE,
  type AlertRule,
  type AlertRulesResult,
  type AlertUsersResult,
  type RecipientFieldsResult,
} from "@/lib/graphql/alert-rules";
import { GROUPS, LIST_PAGE_SIZE, type GroupsResult } from "@/lib/graphql/vehicle-management";
import { useErrorText, useVmLookups, useVmMutations, useVmQuery, VM_KEY } from "@/lib/vehicle-management/use-vm";
import { cn } from "@/lib/utils";

/** Whether recipients can be CC yet (backend B10): asks the schema once per session. */
function useCcSupported() {
  const query = useQuery({
    queryKey: ["schema", "AlertRuleRecipient"],
    queryFn: () => gqlRequestPartial<RecipientFieldsResult>(RECIPIENT_FIELDS, {}),
    staleTime: Infinity,
  });
  return { ready: !query.isPending, supported: Boolean(query.data?.__type?.fields.some((f) => f.name === "isCc")) };
}

/**
 * Notification rules, one row per vehicle (or vehicle group, or all vehicles): which alerts it
 * watches, how people are told (in the app, by email, by browser push) and who: users or typed
 * addresses, each To or CC. The API keeps one rule per alert; the row edits them together.
 */
export function NotificationRulesScreen() {
  const t = useTranslations("masters.vm.notificationRules");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const cc = useCcSupported();
  const list = useQuery({
    queryKey: [VM_KEY, "alertRules", cc.supported],
    queryFn: () => gqlRequestPartial<AlertRulesResult>(alertRulesQuery(cc.supported), { first: LIST_PAGE_SIZE }),
    enabled: cc.ready,
  });
  const users = useVmQuery<AlertUsersResult>("alertUsers", ALERT_USERS);
  const groupsQuery = useVmQuery<GroupsResult>("groups", GROUPS);
  const { run, refresh } = useVmMutations();
  const errorText = useErrorText();
  const [editing, setEditing] = useState<RuleRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<RuleRow | null>(null);
  const [eventFilter, setEventFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const eventTypes = useMemo(() => list.data?.eventTypes.data ?? [], [list.data]);
  const eventName = (id: string) => eventTypes.find((e) => e.id === id)?.name ?? `#${id}`;
  const groups = useMemo(() => (groupsQuery.data?.vehicleGroups.data ?? []).filter((g) => lookups.inScope(g.companyId)), [groupsQuery.data, lookups]);
  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? `#${id}`;
  const allRows = useMemo(() => groupRules((list.data?.alertRules.data ?? []).filter((r) => lookups.inScope(r.companyId))), [list.data, lookups]);
  const target = (r: RuleTarget) =>
    r.vehicleId ? lookups.vehicleLabel(r.vehicleId) : r.vehicleGroupId ? t("groupValue", { name: groupName(r.vehicleGroupId) }) : t("allVehicles");
  const rows = useMemo(
    () =>
      allRows
        .filter((row) => eventFilter === "all" || row.rules.some((r) => r.eventTypeId === eventFilter))
        .filter((row) => statusFilter === "all" || row.rules.some((r) => r.isActive === (statusFilter === "active"))),
    [allRows, eventFilter, statusFilter],
  );
  const channels = (row: RuleRow) =>
    [
      row.rules.some((r) => r.notifyInApp) && t("channels.inApp"),
      row.rules.some((r) => r.notifyEmail) && t("channels.email"),
      row.rules.some((r) => r.notifyPush) && t("channels.push"),
    ].filter(Boolean) as string[];
  /** Everyone notified by the row, once each (To wins when a person is To on one alert and CC on another). */
  const people = (row: RuleRow) => {
    const byPerson = new Map<string, boolean>();
    for (const x of row.rules.flatMap((r) => r.recipients)) {
      const key = x.userId ? `u${x.userId}` : `e${x.email?.toLowerCase()}`;
      byPerson.set(key, (byPerson.get(key) ?? true) && Boolean(x.isCc));
    }
    const ccCount = [...byPerson.values()].filter(Boolean).length;
    return { to: byPerson.size - ccCount, cc: ccCount };
  };
  const status = (row: RuleRow) => (row.rules.every((r) => r.isActive) ? "active" : row.rules.some((r) => r.isActive) ? "partly" : "inactive");

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => setEditing("new")} disabled={!lookups.allow("alerts", "add") || !cc.ready}>
            <Plus />
            {t("add")}
          </Button>
        }
      />
      <KpiCards
        loading={list.isPending}
        items={[
          { key: "total", label: t("kpi.total"), value: allRows.length, icon: <BellRing />, tone: "primary" },
          { key: "active", label: t("kpi.active"), value: allRows.filter((row) => status(row) !== "inactive").length, icon: <BellRing />, tone: "ok" },
          { key: "email", label: t("kpi.email"), value: allRows.filter((row) => row.rules.some((r) => r.notifyEmail)).length, icon: <Mail />, tone: "muted" },
          {
            key: "recipients",
            label: t("kpi.recipients"),
            value: new Set(allRows.flatMap((row) => row.rules.flatMap((r) => r.recipients.map((x) => (x.userId ? `u${x.userId}` : `e${x.email?.toLowerCase()}`))))).size,
            icon: <UserRound />,
            tone: "muted",
          },
        ]}
      />
      <DataTable
        caption={t("title")}
        rows={rows}
        loading={list.isPending}
        error={list.error ? errorText(list.error) : null}
        emptyText={t("empty")}
        searchText={(row) => [target(row), ...rowAlerts(row).map(eventName)].join(" ")}
        filters={
          <>
            <FilterSelect label={t("event")} value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}>
              <option value="all">{tc("all")}</option>
              {eventTypes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label={tc("status")} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">{tc("all")}</option>
              <option value="active">{tc("statuses.active")}</option>
              <option value="inactive">{tc("statuses.inactive")}</option>
            </FilterSelect>
            <Button
              variant="secondary"
              disabled={eventFilter === "all" && statusFilter === "all"}
              onClick={() => {
                setEventFilter("all");
                setStatusFilter("all");
              }}
            >
              <RotateCcw />
              {tc("reset")}
            </Button>
          </>
        }
        onEdit={lookups.allow("alerts", "edit") ? setEditing : undefined}
        onDelete={lookups.allow("alerts", "delete") ? setDeleting : undefined}
        columns={[
          { key: "target", header: t("appliesTo"), sortValue: target, cell: (row) => <span className="font-semibold">{target(row)}</span> },
          {
            key: "alerts",
            header: t("alerts"),
            sortValue: (row) => rowAlerts(row).length,
            cell: (row) => (
              <span className="flex max-w-md flex-wrap gap-1">
                {rowAlerts(row).map((id) => (
                  <span key={id} className="rounded-full border border-primary/30 bg-primary-soft px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-primary">
                    {eventName(id)}
                  </span>
                ))}
              </span>
            ),
          },
          { key: "channels", header: t("sendBy"), cell: (row) => <span className="text-[13px]">{channels(row).join(" · ")}</span> },
          {
            key: "recipients",
            header: t("recipients"),
            sortValue: (row) => people(row).to + people(row).cc,
            cell: (row) => {
              const p = people(row);
              return p.cc ? t("toCcCount", { to: p.to, cc: p.cc }) : t("toCount", { to: p.to });
            },
          },
          {
            key: "status",
            header: tc("status"),
            sortValue: (row) => ["active", "partly", "inactive"].indexOf(status(row)),
            cell: (row) => {
              const s = status(row);
              return <StatusBadge tone={s === "active" ? "ok" : s === "partly" ? "warn" : "muted"}>{s === "partly" ? t("partlyActive") : tc(`statuses.${s}`)}</StatusBadge>;
            },
          },
        ]}
      />

      {editing !== null ? (
        <RuleSheet
          row={editing === "new" ? null : editing}
          rows={allRows}
          targetLabel={target}
          eventTypes={eventTypes}
          groups={groups.map((g) => ({ id: g.id, name: g.name }))}
          users={(users.data?.users.data ?? []).filter((u) => u.companyId === (editing === "new" ? lookups.companyId : editing.companyId))}
          ccSupported={cc.supported}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <ConfirmDelete
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting ? target(deleting) : ""}
        notice={t("deleteNotice", { count: deleting ? rowAlerts(deleting).length : 0 })}
        onConfirm={async () => {
          if (!deleting) return;
          for (const r of deleting.rules) await run(DELETE_ALERT_RULE, { id: r.id });
          await refresh();
          toast.success(tc("deleted"));
        }}
      />
    </div>
  );
}

type Scope = "all" | "vehicle" | "group";

type Form = {
  /** Several alerts make several rules (the API has one alert per rule), each with the same settings. */
  eventTypeIds: string[];
  scope: Scope;
  vehicleId: string;
  vehicleGroupId: string;
  isActive: boolean;
  repeatMinutes: string;
  notifyInApp: boolean;
  notifyEmail: boolean;
  notifyPush: boolean;
  recipients: RecipientRow[];
};

/** A row's form: its alerts, and the settings and recipients of its first rule (saving applies them to all). */
function initialForm(row: RuleRow | null): Form {
  const r = row?.rules[0];
  return {
    eventTypeIds: row ? rowAlerts(row) : [],
    scope: row?.vehicleId ? "vehicle" : row?.vehicleGroupId ? "group" : "all",
    vehicleId: row?.vehicleId ?? "",
    vehicleGroupId: row?.vehicleGroupId ?? "",
    isActive: r?.isActive ?? true,
    repeatMinutes: r?.minRepeatIntervalMinutes != null ? String(r.minRepeatIntervalMinutes) : "",
    notifyInApp: r?.notifyInApp ?? true,
    notifyEmail: r?.notifyEmail ?? true,
    notifyPush: r?.notifyPush ?? false,
    recipients: r ? toRows(r.recipients) : [{ kind: "user", userId: "", email: "", cc: false }],
  };
}

function RuleSheet({
  row,
  rows,
  targetLabel,
  eventTypes,
  groups,
  users,
  ccSupported,
  onClose,
}: {
  row: RuleRow | null;
  rows: RuleRow[];
  targetLabel: (t: RuleTarget) => string;
  eventTypes: Array<{ id: string; name: string; code: string }>;
  groups: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string; email: string; status: string }>;
  ccSupported: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("masters.vm.notificationRules");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const { run, refresh, failInto } = useVmMutations();
  const [initial] = useState(() => initialForm(row));
  const [form, setForm] = useState<Form>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const guard = useDiscardGuard(isDirty(form, initial), onClose);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setRow = (i: number, patch: Partial<RecipientRow>) =>
    set("recipients", form.recipients.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const rowErrors = validateRows(form.recipients);
  const userEmail = (id: string) => users.find((u) => u.id === id)?.email ?? "";
  const eventName = (id: string) => eventTypes.find((e) => e.id === id)?.name ?? `#${id}`;

  const companyId = row?.companyId ?? lookups.companyId ?? "";
  const formTarget: RuleTarget = {
    companyId,
    vehicleId: form.scope === "vehicle" ? form.vehicleId || null : null,
    vehicleGroupId: form.scope === "group" ? form.vehicleGroupId || null : null,
  };
  /** Each alert's rule is named after the alert and the row: "Geofence Enter – GJ-01-KY-5144". */
  const ruleName = (eventTypeId: string) => `${eventName(eventTypeId)} – ${targetLabel(formTarget)}`;

  const validate = (): Record<string, string> => {
    const found: Record<string, string> = {};
    if (form.eventTypeIds.length === 0) found.eventTypeIds = "required";
    if (form.scope === "vehicle" && !form.vehicleId) found.vehicleId = "required";
    else if (form.scope === "group" && !form.vehicleGroupId) found.vehicleGroupId = "required";
    else if (rows.some((other) => other.key !== row?.key && other.key === targetKey(formTarget))) {
      // One row per vehicle: alerts for a target that already has a row belong in that row.
      found[form.scope === "vehicle" ? "vehicleId" : form.scope === "group" ? "vehicleGroupId" : "scope"] = `server:${t("errors.rowExists", { name: targetLabel(formTarget) })}`;
    }
    const repeat = form.repeatMinutes.trim();
    if (repeat && (!/^\d+$/.test(repeat) || Number(repeat) > 10_080)) found.repeatMinutes = `server:${t("errors.repeat")}`;
    if (!form.notifyInApp && !form.notifyEmail && !form.notifyPush) found.channels = t("errors.channel");
    if (form.recipients.length === 0) found.recipients = t("errors.noRecipients");
    else if (Object.keys(rowErrors).length) found.recipients = t("errors.fixRecipients");
    else if (form.notifyEmail && !hasToRecipient(form.recipients)) found.recipients = t("errors.needTo");
    return found;
  };

  const save = async () => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;
    setPending(true);
    try {
      const vars = {
        isActive: form.isActive,
        vehicleId: formTarget.vehicleId,
        vehicleGroupId: formTarget.vehicleGroupId,
        notifyInApp: form.notifyInApp,
        notifyEmail: form.notifyEmail,
        notifyPush: form.notifyPush,
        minRepeatIntervalMinutes: form.repeatMinutes.trim() ? Number(form.repeatMinutes) : null,
      };
      const createRecipient = createRecipientMutation(ccSupported);
      const syncRecipients = async (alertRuleId: string, saved: AlertRule["recipients"]) => {
        const plan = planRecipients(saved, form.recipients);
        await Promise.all(plan.remove.map((rid) => run(DELETE_ALERT_RULE_RECIPIENT, { id: rid })));
        for (const r of plan.add) {
          await run(createRecipient, { alertRuleId, recipientType: r.recipientType, userId: r.userId, email: r.email, ...(ccSupported ? { isCc: r.isCc } : {}) });
        }
      };
      const plan = planRowSave(row?.rules ?? [], form.eventTypeIds);
      // One at a time, so a failure part-way leaves a clear state (the list refreshes either way).
      for (const rule of plan.update) {
        await run(UPDATE_ALERT_RULE, { id: rule.id, ...vars, eventTypeId: rule.eventTypeId, name: ruleName(rule.eventTypeId) }, { previous: rule as unknown as Record<string, unknown> });
        await syncRecipients(rule.id, rule.recipients);
      }
      for (const eventTypeId of plan.create) {
        const { createAlertRule } = await run<{ createAlertRule: { id: string } }>(CREATE_ALERT_RULE, { companyId, ...vars, eventTypeId, name: ruleName(eventTypeId) });
        await syncRecipients(createAlertRule.id, []);
      }
      for (const id of plan.remove) await run(DELETE_ALERT_RULE, { id });
      await refresh();
      toast.success(tc("saved"));
      onClose();
    } catch (err) {
      failInto(err, setErrors);
      await refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && guard.requestClose()}
      size="xl"
      title={row ? t("editTitle", { name: targetLabel(row) }) : t("add")}
      description={t("sheetHint")}
      footer={
        <>
          <Button variant="secondary" onClick={guard.requestClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? tc("saving") : tc("save")}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {row && rowSettingsDiffer(row) ? <p className="rounded-ctl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">{t("settingsDiffer")}</p> : null}
        <FormSection title={t("sections.when")}>
          <Field id="nr-scope" label={t("appliesTo")} error={errors.scope}>
            <Select id="nr-scope" value={form.scope} onChange={(e) => set("scope", e.target.value as Scope)}>
              <option value="all">{t("allVehicles")}</option>
              <option value="vehicle">{t("oneVehicle")}</option>
              <option value="group">{t("oneGroup")}</option>
            </Select>
          </Field>
          {form.scope === "vehicle" ? (
            <Field id="nr-vehicle" label={`${t("vehicle")} *`} error={errors.vehicleId}>
              <Select id="nr-vehicle" value={form.vehicleId} onChange={(e) => set("vehicleId", e.target.value)}>
                <option value="">{tc("choose")}</option>
                {lookups.vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {lookups.vehicleLabel(v.id)}
                  </option>
                ))}
              </Select>
            </Field>
          ) : form.scope === "group" ? (
            <Field id="nr-group" label={`${t("group")} *`} error={errors.vehicleGroupId}>
              <Select id="nr-group" value={form.vehicleGroupId} onChange={(e) => set("vehicleGroupId", e.target.value)}>
                <option value="">{tc("choose")}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <div aria-hidden />
          )}
          <div className="sm:col-span-2">
            <Field id="nr-events" label={`${t("alerts")} *`} error={errors.eventTypeIds} hint={t("alertsHint")}>
              <AlertPicker
                id="nr-events"
                options={eventTypes}
                value={form.eventTypeIds}
                selectAllLabel={tc("selectAll")}
                clearLabel={t("clearAlerts")}
                selectedLabel={tc("selectedCount", { count: form.eventTypeIds.length })}
                onChange={(ids) => set("eventTypeIds", ids)}
              />
            </Field>
          </div>
          <Field id="nr-repeat" label={t("repeat")} hint={t("repeatHint")} error={errors.repeatMinutes}>
            <Input id="nr-repeat" inputMode="numeric" dir="ltr" value={form.repeatMinutes} onChange={(e) => set("repeatMinutes", e.target.value.replace(/[^\d]/g, ""))} />
          </Field>
          <div className="flex items-end pb-2">
            <Checkbox label={t("activeLabel")} checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} />
          </div>
        </FormSection>

        <FormSection title={t("sections.how")} columns={1}>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Checkbox label={t("channels.inApp")} checked={form.notifyInApp} onChange={(e) => set("notifyInApp", e.target.checked)} />
            <Checkbox label={t("channels.email")} checked={form.notifyEmail} onChange={(e) => set("notifyEmail", e.target.checked)} />
            <Checkbox label={t("channels.push")} checked={form.notifyPush} onChange={(e) => set("notifyPush", e.target.checked)} />
          </div>
          {errors.channels ? <p className="text-xs font-medium text-destructive">{errors.channels}</p> : null}
          {form.notifyEmail ? <p className="text-xs text-muted-foreground">{t("emailTemplateHint")}</p> : null}
        </FormSection>

        <FormSection title={t("sections.who")} description={ccSupported ? t("whoHint") : t("whoHintNoCc")} columns={1}>
          <div className="grid gap-2">
            {form.recipients.map((r, i) => {
              const problem = rowErrors[i];
              return (
                <div key={i} className="grid gap-1">
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-surface-2/40 p-2 sm:flex-nowrap">
                    <div className="w-40 shrink-0">
                      <Select
                        aria-label={t("recipientType")}
                        value={r.kind}
                        icons={{ user: <UserRound className="text-primary" />, email: <Mail className="text-primary" /> }}
                        onChange={(e) => setRow(i, { kind: e.target.value as RecipientRow["kind"] })}
                      >
                        <option value="user">{t("kind.user")}</option>
                        <option value="email">{t("kind.email")}</option>
                      </Select>
                    </div>
                    <div className="min-w-0 flex-1 basis-56">
                      {r.kind === "user" ? (
                        <Select aria-label={t("kind.user")} aria-invalid={problem ? true : undefined} value={r.userId} onChange={(e) => setRow(i, { userId: e.target.value })}>
                          <option value="">{t("chooseUser")}</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id} disabled={u.status !== "active"}>
                              {u.email ? `${u.name} (${u.email})` : u.name}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Input
                          type="email"
                          dir="ltr"
                          aria-label={t("kind.email")}
                          aria-invalid={problem ? true : undefined}
                          placeholder="name@company.com"
                          value={r.email}
                          onChange={(e) => setRow(i, { email: e.target.value })}
                        />
                      )}
                    </div>
                    <div
                      role="radiogroup"
                      aria-label={t("sendAs")}
                      title={ccSupported ? undefined : t("ccPending")}
                      className="flex shrink-0 rounded-full border border-border bg-surface p-0.5"
                    >
                      {([false, true] as const).map((isCc) => (
                        <button
                          key={String(isCc)}
                          type="button"
                          role="radio"
                          aria-checked={r.cc === isCc}
                          disabled={isCc && !ccSupported}
                          onClick={() => setRow(i, { cc: isCc })}
                          className={cn(
                            "h-7 min-w-12 cursor-pointer rounded-full px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                            r.cc === isCc ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {isCc ? t("cc") : t("to")}
                        </button>
                      ))}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 hover:text-destructive"
                      aria-label={tc("remove")}
                      onClick={() => set("recipients", form.recipients.filter((_, j) => j !== i))}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  {problem ? <p className="ps-2 text-xs font-medium text-destructive">{t(`errors.row.${problem}`)}</p> : null}
                  {!problem && r.kind === "user" && r.userId && !userEmail(r.userId) && form.notifyEmail ? (
                    <p className="ps-2 text-xs text-amber-700">{t("userNoEmail")}</p>
                  ) : null}
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => set("recipients", [...form.recipients, { kind: "user", userId: "", email: "", cc: false }])}>
                <UserRound />
                {t("addUser")}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => set("recipients", [...form.recipients, { kind: "email", userId: "", email: "", cc: false }])}>
                <Mail />
                {t("addEmail")}
              </Button>
            </div>
            {errors.recipients ? <p className="text-xs font-medium text-destructive">{errors.recipients}</p> : null}
          </div>
        </FormSection>
        {form.notifyEmail ? (
          <FormSection title={t("preview.title")} description={t("preview.hint")} columns={1}>
            <EmailPreview
              ruleName={form.eventTypeIds[0] ? ruleName(form.eventTypeIds[0]) : t("preview.sampleRule")}
              alert={eventTypes.find((e) => e.id === form.eventTypeIds[0]) ?? null}
              to={form.recipients.filter((r) => !r.cc).map((r) => (r.kind === "user" ? userEmail(r.userId) || users.find((u) => u.id === r.userId)?.name || "" : r.email.trim())).filter(Boolean)}
              cc={form.recipients.filter((r) => r.cc).map((r) => (r.kind === "user" ? userEmail(r.userId) : r.email.trim())).filter(Boolean)}
            />
          </FormSection>
        ) : null}
        <button type="submit" hidden />
      </form>
      {guard.dialog}
    </Sheet>
  );
}

const HEADLINE_CODES = ["geofence_enter", "geofence_exit", "overspeed", "ignition_on", "ignition_off", "low_battery", "device_offline", "idling", "working_hours_violation"];

/**
 * The alert email as it will look: the fixed template (email-templates/alert.blade.php, same
 * images from public/email/) filled with sample data for the first chosen alert, with the real To
 * and CC lists.
 */
function EmailPreview({
  ruleName,
  alert,
  to,
  cc,
}: {
  ruleName: string;
  alert: { name: string; code: string } | null;
  to: string[];
  cc: string[];
}) {
  const t = useTranslations("masters.vm.notificationRules.preview");
  const lookups = useVmLookups();
  const zone = useCompanyTimeZone();
  const [now] = useState(() => new Date().toISOString());
  const sample = lookups.vehicles[0];
  const code = alert?.code ?? "geofence_enter";
  const isGeofence = code === "geofence_enter" || code === "geofence_exit";
  const alertName = alert?.name ?? t("sampleAlert");
  const plate = sample?.plateNo ?? "DXB-A-12345";
  const vehicle = sample?.vehicleName ? `${plate} (${sample.vehicleName})` : plate;
  const speed = code === "overspeed" ? "96 km/h" : "";
  const headline = HEADLINE_CODES.includes(code)
    ? t(`headline.${code}`, { geofence: t("sampleGeofence"), speed })
    : t("headline.other", { alert: alertName });
  const rows: Array<{ icon: string; label: string; value: string; link?: string }> = [
    { icon: "row-vehicle", label: t("vehicle"), value: vehicle },
    { icon: "row-location", label: t("location"), value: t("sampleLocation"), link: t("map") },
    ...(isGeofence ? [{ icon: "row-geofence", label: t("geofence"), value: t("sampleGeofence") }] : []),
    ...(speed ? [{ icon: "row-speed", label: t("speed"), value: speed }] : []),
  ];
  const features: Array<[string, string]> = [
    ["feature-tracking", t("features.tracking")],
    ["feature-alerts", t("features.alerts")],
    ["feature-security", t("features.security")],
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface-2/50">
      {/* The envelope: who it goes to */}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-b border-border bg-surface px-4 py-3 text-[13px]">
        <dt className="text-muted-foreground">{t("from")}</dt>
        <dd>Klever Tracker</dd>
        <dt className="text-muted-foreground">{t("to")}</dt>
        <dd className={cn("break-all", !to.length && "text-destructive")}>{to.length ? to.join(", ") : t("nobody")}</dd>
        {cc.length ? (
          <>
            <dt className="text-muted-foreground">{t("cc")}</dt>
            <dd className="break-all">{cc.join(", ")}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">{t("subject")}</dt>
        <dd className="font-semibold">{fillPlaceholders(DEFAULT_SUBJECT, { alert: alertName, vehicle: plate })}</dd>
      </dl>

      {/* The email itself (always light, like in a mail app) */}
      <div className="bg-[#eef3f2] p-3 sm:p-5">
        {/* eslint-disable @next/next/no-img-element -- email images, shown exactly as the email loads them */}
        <div className="mx-auto max-w-[600px] overflow-hidden rounded-[18px] bg-white text-[#102422] shadow-sm">
          <img src="/email/header.png" alt={t("headerAlt")} className="block h-auto w-full" />

          <div className="grid gap-4 px-4 pt-5 sm:px-6">
            {/* Alert box */}
            <div className="flex items-center gap-4 rounded-[14px] border border-[#f4a5a8] bg-[#fdecec] px-4 py-4 sm:px-5">
              <img src="/email/alert-red.png" alt="" className="size-[52px] shrink-0 sm:size-[60px]" />
              <span className="h-14 w-px shrink-0 bg-[#f4a5a8]" aria-hidden />
              <div className="min-w-0">
                <p className="text-lg font-extrabold text-[#c81e1e] sm:text-[21px]">{t("alertTitle")}</p>
                <p className="text-[15px] sm:text-base">{headline}</p>
              </div>
            </div>

            {/* Vehicle alert details */}
            <div className="overflow-hidden rounded-[14px] border border-[#dbe5e3]">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-[#0b5f5a] px-4 py-3 text-white sm:px-5">
                <img src="/email/icon-car-white.png" alt="" className="size-7" />
                <span className="flex-1 text-base font-bold sm:text-[17px]">{t("details")}</span>
                <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold" dir="ltr">
                  <img src="/email/icon-clock-white.png" alt="" className="size-4" />
                  {formatInCompanyTz(now, zone, "dd-MM-yyyy HH:mm")} ({zone})
                </span>
              </div>
              <div className="px-4 py-1.5 sm:px-5">
                {rows.map((r, i) => (
                  <div key={r.icon} className="flex items-center gap-3 py-2.5">
                    <img src={`/email/${r.icon}.png`} alt="" className="size-10 shrink-0" />
                    <span className={cn("w-24 shrink-0 self-stretch content-center text-sm text-[#566b68] sm:w-28", i > 0 && "border-t border-[#e6eeec]")}>{r.label}</span>
                    <span className={cn("min-w-0 flex-1 self-stretch content-center border-s border-[#e6eeec] ps-3.5 text-[15px] font-bold", i > 0 && "border-t")}>
                      {r.value}
                      {r.link ? <span className="block text-[12.5px] font-semibold text-[#0b6e69] underline">{r.link}</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Button */}
            <span className="mx-auto inline-flex items-center gap-2.5 rounded-full bg-[#0b6e69] px-7 py-3 text-base font-bold text-white shadow-[0_6px_16px_rgba(11,110,105,0.25)]">
              <img src="/email/icon-live-white.png" alt="" className="size-[22px]" />
              {t("button")}
              <img src="/email/icon-chevron-white.png" alt="" className="size-[18px] rtl:-scale-x-100" />
            </span>

            {/* Features */}
            <div className="grid grid-cols-3 rounded-[14px] bg-[#e3f3f0]">
              {features.map(([icon, label], i) => (
                <div key={icon} className={cn("flex items-center justify-center gap-2 px-2 py-3.5 text-[13px] leading-tight sm:text-sm", i > 0 && "border-s border-[#b9ddd7]")}>
                  <img src={`/email/${icon}.png`} alt="" className="size-[26px] shrink-0 sm:size-[30px]" />
                  <span className="max-w-[5.5rem]">{label}</span>
                </div>
              ))}
            </div>

            {/* Sign-off */}
            <div className="border-t border-[#e3ebe9] pt-5 text-center">
              <p className="text-[19px] font-bold italic">{t("closing")}</p>
              <p className="mt-1 text-[15px] text-[#566b68]">{t("team")}</p>
              <p className="mt-3 text-xs text-[#7d908d]">{t("why", { rule: ruleName })}</p>
            </div>
          </div>
          <img src="/email/footer.png" alt="" className="mt-3 block h-auto w-full" />
        </div>
        {/* eslint-enable @next/next/no-img-element */}
      </div>
    </div>
  );
}

/** Multi-select for alerts: a pill per alert, ticked when chosen, plus Select all. */
function AlertPicker({
  id,
  options,
  value,
  selectAllLabel,
  clearLabel,
  selectedLabel,
  onChange,
}: {
  id: string;
  options: Array<{ id: string; name: string }>;
  value: string[];
  selectAllLabel: string;
  clearLabel: string;
  selectedLabel: string;
  onChange: (ids: string[]) => void;
}) {
  const chosen = new Set(value);
  const allChosen = options.length > 0 && options.every((o) => chosen.has(o.id));
  // Keep the alerts' own order, whatever order they were ticked in.
  const ordered = (ids: Set<string>) => options.filter((o) => ids.has(o.id)).map((o) => o.id);
  return (
    <div id={id} role="group" className="grid gap-2 rounded-xl border border-border/70 bg-surface-2/40 p-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = chosen.has(o.id);
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                const next = new Set(chosen);
                if (on) next.delete(o.id);
                else next.add(o.id);
                onChange(ordered(next));
              }}
              className={cn(
                "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors",
                on ? "border-primary bg-primary-soft font-semibold text-primary" : "border-border bg-surface text-foreground hover:border-primary/50",
              )}
            >
              <span
                className={cn(
                  "grid size-[18px] place-items-center rounded-full border",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-border-strong",
                )}
                aria-hidden
              >
                {on ? <Check className="size-3" strokeWidth={3.5} /> : null}
              </span>
              {o.name}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
        <button
          type="button"
          className="cursor-pointer font-semibold text-primary hover:underline"
          onClick={() => onChange(allChosen ? [] : options.map((o) => o.id))}
        >
          {allChosen ? clearLabel : selectAllLabel}
        </button>
        <span>{selectedLabel}</span>
      </div>
    </div>
  );
}
