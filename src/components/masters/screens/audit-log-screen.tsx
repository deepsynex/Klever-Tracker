"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown, FilePlus2, FilePen, History, Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useMemo, useState } from "react";
import { PANEL, Pager } from "@/components/masters/data-table";
import { KpiCards, PageHeader, StatusBadge } from "@/components/masters/page-header";
import { Alert } from "@/components/ui/alert";
import { auditChanges, auditSubject, groupAuditEntries, nameFromValues, subjectLabel } from "@/lib/account-management/audit";
import { formatInCompanyTz, useCompanyTimeZone } from "@/lib/company-time";
import { gqlRequestPartial } from "@/lib/graphql/client";
import { AUDIT_LOGS, type AuditLogsResult } from "@/lib/graphql/account-management";
import { gqlRequest } from "@/lib/graphql/client";
import { parseApiDateTime } from "@/lib/vehicle-management/helpers";
import { useErrorText, useVmLookups } from "@/lib/vehicle-management/use-vm";
import { cn } from "@/lib/utils";

function actionTone(action: string): "ok" | "info" | "warn" | "muted" {
  const a = action.toLowerCase();
  if (a.includes("delete")) return "warn";
  if (a.includes("create")) return "ok";
  if (a.includes("update")) return "info";
  return "muted";
}

/**
 * Audit log (API Doc §6.13): an append-only trail of who changed what, newest first, per company
 * (the company picker above; platform staff can also see all companies, with a Company column).
 * Each entry expands to its changed fields (before → after). Changes made in the app are recorded
 * by the GraphQL proxy (lib/audit); the backend adds its own.
 *
 * The API pages oldest first and can't filter by company, so the newest MAX_ENTRIES are read from
 * the last pages and filtered and paged here.
 */
const MAX_ENTRIES = 1000;
const API_PAGE = 250;

const AUDIT_TOTAL = /* GraphQL */ `
  query AuditTotal {
    auditLogs(first: 1) {
      paginatorInfo {
        total
      }
    }
  }
`;

/** Names of the records entries point at, for the Record column (lists the role may not read come back empty). */
const AUDIT_NAMES = /* GraphQL */ `
  query AuditRecordNames {
    alertRules(first: 1000) {
      data {
        id
        name
      }
    }
    geofences(first: 1000) {
      data {
        id
        name
      }
    }
    roles(first: 1000) {
      data {
        id
        name
      }
    }
    departments(first: 1000) {
      data {
        id
        name
      }
    }
    vehicleGroups(first: 1000) {
      data {
        id
        name
      }
    }
  }
`;
type Named = { data: Array<{ id: string; name: string }> } | null;
type AuditNamesResult = { alertRules: Named; geofences: Named; roles: Named; departments: Named; vehicleGroups: Named };
const byId = (list: Named) => new Map((list?.data ?? []).map((x) => [x.id, x.name]));

/** The newest entries (up to MAX_ENTRIES), newest first, plus the user names. */
async function loadNewest(): Promise<{ entries: AuditLogsResult["auditLogs"]["data"]; users: AuditLogsResult["users"]["data"]; total: number }> {
  const { auditLogs } = await gqlRequest<{ auditLogs: { paginatorInfo: { total: number } } }>(AUDIT_TOTAL);
  const total = auditLogs.paginatorInfo.total;
  const last = Math.max(1, Math.ceil(total / API_PAGE));
  const entries: AuditLogsResult["auditLogs"]["data"] = [];
  let users: AuditLogsResult["users"]["data"] = [];
  for (let page = last; page >= 1 && entries.length < MAX_ENTRIES; page--) {
    const res = await gqlRequestPartial<AuditLogsResult>(AUDIT_LOGS, { first: API_PAGE, page });
    entries.push(...res.auditLogs.data);
    if (!users.length) users = res.users.data;
  }
  entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || Number(b.id) - Number(a.id));
  return { entries: entries.slice(0, MAX_ENTRIES), users, total };
}
export function AuditLogScreen() {
  const t = useTranslations("masters.am.audit");
  const errorText = useErrorText();
  const zone = useCompanyTimeZone();
  const lookups = useVmLookups();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["vm", "am-audit"],
    queryFn: loadNewest,
    placeholderData: keepPreviousData,
  });
  const userName = useMemo(() => new Map((query.data?.users ?? []).map((u) => [u.id, u.name])), [query.data]);
  /** The User column shows the username people sign in with (the name as a tooltip), never a bare id. */
  const users = useMemo(() => new Map((query.data?.users ?? []).map((u) => [u.id, u])), [query.data]);
  const namesQuery = useQuery({
    queryKey: ["vm", "am-audit-names"],
    queryFn: () => gqlRequestPartial<AuditNamesResult>(AUDIT_NAMES),
  });
  /**
   * The record an entry is about, by name: "Alert rule · Geofence Enter – TEST-QA-001". Looked up by
   * type and id; a deleted record falls back to a name in the entry's own values, then to its id.
   */
  const recordName = useMemo(() => {
    const n = namesQuery.data;
    const tables: Record<string, Map<string, string>> = {
      AlertRule: byId(n?.alertRules ?? null),
      Geofence: byId(n?.geofences ?? null),
      Role: byId(n?.roles ?? null),
      RolePermission: byId(n?.roles ?? null),
      Department: byId(n?.departments ?? null),
      VehicleGroup: byId(n?.vehicleGroups ?? null),
    };
    return (r: { auditableType: string | null; auditableId: string | null; newValues: string | null; oldValues: string | null }): string | null => {
      const type = auditSubject(r.auditableType);
      const id = r.auditableId;
      let found: string | null | undefined = null;
      if (id) {
        if (tables[type]) found = tables[type].get(id);
        else if (type === "Vehicle") found = lookups.vehicleById.has(id) ? lookups.vehicleLabel(id) : null;
        else if (type === "Driver") found = lookups.driverById.get(id)?.name;
        else if (type === "User") found = userName.get(id);
        else if (type === "Company") found = lookups.companies.find((c) => c.id === id)?.name;
        else if (type === "PlatformSettings") found = t("mapSettings");
      }
      return found || nameFromValues(r.newValues, r.oldValues);
    };
  }, [namesQuery.data, lookups, userName, t]);
  /** "All companies" (platform staff): show which company each entry belongs to. */
  const showCompany = lookups.isPlatform && lookups.companyId === null;

  // The chosen company's entries (platform-wide entries, e.g. map settings, only under All companies).
  const companyRows = useMemo(() => (query.data?.entries ?? []).filter((r) => lookups.inScope(r.companyId)), [query.data, lookups]);
  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return companyRows;
    return companyRows.filter((r) =>
      `${r.action} ${subjectLabel(r.auditableType)} ${recordName(r) ?? ""} ${r.auditableId ?? ""} ${userName.get(r.userId ?? "") ?? ""} ${users.get(r.userId ?? "")?.username ?? ""} ${r.ipAddress ?? ""} ${showCompany ? lookups.companyName(r.companyId) : ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [companyRows, filter, userName, users, showCompany, lookups, recordName]);
  // One row per save: entries by the same user and company, seconds apart, are shown together.
  const groups = useMemo(() => groupAuditEntries(rows, (at) => parseApiDateTime(at)?.getTime() ?? 0), [rows]);
  const pageCount = Math.max(1, Math.ceil(groups.length / pageSize));
  const shownPage = Math.min(page, pageCount - 1);
  const pageGroups = groups.slice(shownPage * pageSize, (shownPage + 1) * pageSize);
  const countAction = (word: string) => companyRows.filter((r) => r.action.toLowerCase().includes(word)).length;

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} />

      <KpiCards
        loading={query.isPending}
        items={[
          { key: "total", label: t("kpi.total"), value: companyRows.length, icon: <History />, tone: "primary" },
          { key: "created", label: t("kpi.created"), value: countAction("create"), icon: <FilePlus2 />, tone: "ok" },
          { key: "updated", label: t("kpi.updated"), value: countAction("update"), icon: <FilePen />, tone: "warn" },
          { key: "deleted", label: t("kpi.deleted"), value: countAction("delete"), icon: <Trash2 />, tone: "muted" },
        ]}
      />

      <div className={cn(PANEL, "flex flex-wrap items-center gap-3 p-3")}>
        <div className="relative w-full sm:w-80">
          <Search
            className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(0);
            }}
            placeholder={t("filter")}
            aria-label={t("filter")}
            className="h-11 w-full rounded-xl border border-border/80 bg-surface ps-10 pe-3 text-sm text-foreground shadow-2xs placeholder:text-muted-foreground/70 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
          />
        </div>
        {query.data ? (
          <span className="ms-auto text-sm font-medium text-muted-foreground">
            {t("total", { n: groups.length })}
            {query.data.total > MAX_ENTRIES ? ` · ${t("newestOnly", { n: MAX_ENTRIES })}` : ""}
          </span>
        ) : null}
      </div>

      {query.error ? (
        <Alert tone="error">{errorText(query.error)}</Alert>
      ) : (
        <div className={cn(PANEL, "min-w-0 overflow-hidden")}>
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{t("title")}</caption>
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border/70">
                  <th scope="col" className="w-10 ps-3" />
                  <th scope="col" className="px-3 py-3.5 text-start font-semibold whitespace-nowrap">
                    {t("when")}
                  </th>
                  {showCompany ? (
                    <th scope="col" className="px-3 py-3.5 text-start font-semibold whitespace-nowrap">
                      {t("company")}
                    </th>
                  ) : null}
                  <th scope="col" className="px-3 py-3.5 text-start font-semibold whitespace-nowrap">
                    {t("who")}
                  </th>
                  <th scope="col" className="px-3 py-3.5 text-start font-semibold whitespace-nowrap">
                    {t("action")}
                  </th>
                  <th scope="col" className="px-3 py-3.5 text-start font-semibold whitespace-nowrap">
                    {t("record")}
                  </th>
                  <th scope="col" className="px-3 py-3.5 text-start font-semibold whitespace-nowrap">
                    {t("ip")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {query.isPending ? (
                  <tr>
                    <td colSpan={showCompany ? 7 : 6} className="px-3 py-12 text-center text-muted-foreground">
                      {t("loading")}
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={showCompany ? 7 : 6} className="px-3 py-12 text-center text-muted-foreground">
                      {filter ? t("noMatch") : t("empty")}
                    </td>
                  </tr>
                ) : (
                  pageGroups.map((group) => {
                    const r = group[0];
                    const expanded = open === r.id;
                    const canExpand = group.length > 1 || group.some((e) => auditChanges(e.oldValues, e.newValues).length > 0);
                    // "update_alert_rule ×2": each action once, with how many records it touched.
                    const actions = [...group.reduce((m, e) => m.set(e.action, (m.get(e.action) ?? 0) + 1), new Map<string, number>())];
                    const recordLabel = (e: typeof r) => recordName(e) ?? (e.auditableId ? `#${e.auditableId}` : "—");
                    // The row names the main record (the alert rule), not one of its recipients or assignments.
                    const head = group.find((e) => !/(Recipient|Vehicle|VehicleGroup|Permission)$/.test(auditSubject(e.auditableType)) || auditSubject(e.auditableType) === "Vehicle" || auditSubject(e.auditableType) === "VehicleGroup") ?? r;
                    return (
                      <Fragment key={r.id}>
                        <tr
                          className={cn(
                            "border-t border-border/50 transition-colors hover:bg-surface-2/40",
                            expanded && "bg-surface-2/50",
                          )}
                        >
                          <td className="ps-3 pe-1">
                            {canExpand ? (
                              <button
                                type="button"
                                onClick={() => setOpen(expanded ? null : r.id)}
                                aria-expanded={expanded}
                                aria-label={t("showChanges")}
                                className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-surface-2"
                              >
                                <ChevronDown
                                  className={cn("size-4 transition-transform", !expanded && "-rotate-90 rtl:rotate-90")}
                                  aria-hidden
                                />
                              </button>
                            ) : null}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3.5" dir="ltr">
                            {formatInCompanyTz(r.createdAt, zone)}
                          </td>
                          {showCompany ? (
                            <td className="px-3 py-3.5 whitespace-nowrap">{r.companyId ? lookups.companyName(r.companyId) : t("platform")}</td>
                          ) : null}
                          <td className="px-3 py-3.5">
                            {r.userId ? (
                              <span dir="ltr" className="font-mono text-[13px]" title={users.get(r.userId)?.name}>
                                {users.get(r.userId)?.username || users.get(r.userId)?.name || t("unknownUser")}
                              </span>
                            ) : (
                              t("system")
                            )}
                          </td>
                          <td className="px-3 py-3.5">
                            <span className="flex flex-wrap gap-1">
                              {actions.map(([action, count]) => (
                                <StatusBadge key={action} tone={actionTone(action)}>
                                  {action}
                                  {count > 1 ? ` ×${count}` : ""}
                                </StatusBadge>
                              ))}
                            </span>
                          </td>
                          <td className="px-3 py-3.5">
                            {head.auditableType || head.auditableId ? (
                              <span className="grid">
                                <span className="font-medium">{recordLabel(head)}</span>
                                <span className="text-xs text-muted-foreground">
                                  {group.length > 1 ? (
                                    t("moreRecords", { count: group.length - 1 })
                                  ) : (
                                    <>
                                      {subjectLabel(head.auditableType)}
                                      {head.auditableId ? <span dir="ltr"> #{head.auditableId}</span> : null}
                                    </>
                                  )}
                                </span>
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-3.5 pe-5 text-muted-foreground" dir="ltr">
                            {r.ipAddress ?? "—"}
                          </td>
                        </tr>
                        {expanded ? (
                          <tr className="border-t border-border/60 bg-surface-2/30">
                            <td />
                            <td colSpan={showCompany ? 6 : 5} className="px-3 py-3">
                              <div className="grid gap-3">
                                {group.map((e) => {
                                  const changes = auditChanges(e.oldValues, e.newValues);
                                  return (
                                    <div key={e.id} className={cn("grid gap-1.5", group.length > 1 && "rounded-xl border border-border/70 bg-surface p-2.5")}>
                                      {group.length > 1 ? (
                                        <p className="flex flex-wrap items-center gap-2 text-xs">
                                          <span className="font-semibold">{recordLabel(e)}</span>
                                          <span className="text-muted-foreground">
                                            {subjectLabel(e.auditableType)}
                                            {e.auditableId ? <span dir="ltr"> #{e.auditableId}</span> : null}
                                          </span>
                                          <StatusBadge tone={actionTone(e.action)}>{e.action}</StatusBadge>
                                        </p>
                                      ) : null}
                                      {changes.length > 0 ? (
                                        <dl className="grid gap-1 text-xs sm:grid-cols-[minmax(120px,auto)_1fr]">
                                          {changes.map((c) => (
                                            <Fragment key={c.field}>
                                              <dt className="font-semibold" dir="ltr">
                                                {c.field}
                                              </dt>
                                              <dd className="break-all" dir="ltr">
                                                <span className="text-stopped line-through decoration-stopped/50">{c.before || "∅"}</span>
                                                <span className="mx-1.5 text-muted-foreground">→</span>
                                                <span className="text-moving">{c.after || "∅"}</span>
                                              </dd>
                                            </Fragment>
                                          ))}
                                        </dl>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {groups.length > 0 ? (
            <Pager
              page={shownPage}
              pageCount={pageCount}
              pageSize={pageSize}
              onPage={setPage}
              onPageSize={(size) => {
                setPageSize(size);
                setPage(0);
              }}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
