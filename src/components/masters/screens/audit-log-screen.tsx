"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown, FilePlus2, FilePen, History, Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useMemo, useState } from "react";
import { PANEL, Pager } from "@/components/masters/data-table";
import { KpiCards, PageHeader, StatusBadge } from "@/components/masters/page-header";
import { Alert } from "@/components/ui/alert";
import { auditChanges, auditSubject } from "@/lib/account-management/audit";
import { formatInCompanyTz, useCompanyTimeZone } from "@/lib/company-time";
import { gqlRequestPartial } from "@/lib/graphql/client";
import { AUDIT_LOGS, type AuditLogsResult } from "@/lib/graphql/account-management";
import { useErrorText } from "@/lib/vehicle-management/use-vm";
import { cn } from "@/lib/utils";

function actionTone(action: string): "ok" | "info" | "warn" | "muted" {
  const a = action.toLowerCase();
  if (a.includes("delete")) return "warn";
  if (a.includes("create")) return "ok";
  if (a.includes("update")) return "info";
  return "muted";
}

/**
 * Audit log (API Doc §6.13): an append-only trail of who changed what, newest first, paged on the
 * server. Each entry expands to its changed fields (before → after).
 */
export function AuditLogScreen() {
  const t = useTranslations("masters.am.audit");
  const errorText = useErrorText();
  const zone = useCompanyTimeZone();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["vm", "am-audit", page, pageSize],
    queryFn: () => gqlRequestPartial<AuditLogsResult>(AUDIT_LOGS, { first: pageSize, page }),
    placeholderData: keepPreviousData,
  });
  const info = query.data?.auditLogs.paginatorInfo;
  const userName = useMemo(() => new Map((query.data?.users.data ?? []).map((u) => [u.id, u.name])), [query.data]);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const all = [...(query.data?.auditLogs.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!q) return all;
    return all.filter((r) =>
      `${r.action} ${auditSubject(r.auditableType)} ${r.auditableId ?? ""} ${userName.get(r.userId ?? "") ?? ""} ${r.ipAddress ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [query.data, filter, userName]);

  const pageRows = query.data?.auditLogs.data ?? [];
  const countAction = (word: string) => pageRows.filter((r) => r.action.toLowerCase().includes(word)).length;

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} />

      <KpiCards
        loading={query.isPending}
        items={[
          { key: "total", label: t("kpi.total"), value: info?.total ?? 0, icon: <History />, tone: "primary" },
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
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("filter")}
            aria-label={t("filter")}
            className="h-11 w-full rounded-xl border border-border/80 bg-surface ps-10 pe-3 text-sm text-foreground shadow-2xs placeholder:text-muted-foreground/70 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
          />
        </div>
        {info ? (
          <span className="ms-auto text-sm font-medium text-muted-foreground" dir="ltr">
            {t("total", { n: info.total })}
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
                    <td colSpan={6} className="px-3 py-12 text-center text-muted-foreground">
                      {t("loading")}
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-12 text-center text-muted-foreground">
                      {filter ? t("noMatch") : t("empty")}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const changes = auditChanges(r.oldValues, r.newValues);
                    const expanded = open === r.id;
                    return (
                      <Fragment key={r.id}>
                        <tr
                          className={cn(
                            "border-t border-border/50 transition-colors hover:bg-surface-2/40",
                            expanded && "bg-surface-2/50",
                          )}
                        >
                          <td className="ps-3 pe-1">
                            {changes.length > 0 ? (
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
                          <td className="px-3 py-3.5">
                            {r.userId ? (userName.get(r.userId) ?? `#${r.userId}`) : t("system")}
                          </td>
                          <td className="px-3 py-3.5">
                            <StatusBadge tone={actionTone(r.action)}>{r.action}</StatusBadge>
                          </td>
                          <td className="px-3 py-3.5">
                            {auditSubject(r.auditableType) || "—"}
                            {r.auditableId ? (
                              <span className="text-muted-foreground" dir="ltr">
                                {" "}
                                #{r.auditableId}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-3.5 pe-5 text-muted-foreground" dir="ltr">
                            {r.ipAddress ?? "—"}
                          </td>
                        </tr>
                        {expanded ? (
                          <tr className="border-t border-border/60 bg-surface-2/30">
                            <td />
                            <td colSpan={5} className="px-3 py-3">
                              <dl className="grid gap-1 text-xs sm:grid-cols-[minmax(120px,auto)_1fr]">
                                {changes.map((c) => (
                                  <Fragment key={c.field}>
                                    <dt className="font-semibold" dir="ltr">
                                      {c.field}
                                    </dt>
                                    <dd className="break-all" dir="ltr">
                                      <span className="text-stopped line-through decoration-stopped/50">
                                        {c.before || "∅"}
                                      </span>
                                      <span className="mx-1.5 text-muted-foreground">→</span>
                                      <span className="text-moving">{c.after || "∅"}</span>
                                    </dd>
                                  </Fragment>
                                ))}
                              </dl>
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
          {info && info.total > 0 ? (
            <Pager
              page={page - 1}
              pageCount={Math.max(1, info.lastPage)}
              pageSize={pageSize}
              onPage={(p) => setPage(p + 1)}
              onPageSize={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
