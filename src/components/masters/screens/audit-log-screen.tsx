"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useMemo, useState } from "react";
import { PageHeader, StatusBadge } from "@/components/masters/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { auditChanges, auditSubject } from "@/lib/account-management/audit";
import { formatInCompanyTz, useCompanyTimeZone } from "@/lib/company-time";
import { gqlRequestPartial } from "@/lib/graphql/client";
import { AUDIT_LOGS, type AuditLogsResult } from "@/lib/graphql/account-management";
import { useErrorText } from "@/lib/vehicle-management/use-vm";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

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
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["vm", "am-audit", page],
    queryFn: () => gqlRequestPartial<AuditLogsResult>(AUDIT_LOGS, { first: PAGE_SIZE, page }),
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

  return (
    <div className="grid gap-4">
      <PageHeader title={t("title")} description={t("description")} />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("filter")}
          aria-label={t("filter")}
          className="max-w-xs"
        />
        {info ? (
          <span className="ms-auto text-[13px] text-muted-foreground" dir="ltr">
            {t("total", { n: info.total })}
          </span>
        ) : null}
      </div>

      {query.error ? (
        <Alert tone="error">{errorText(query.error)}</Alert>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full text-[13px]">
            <caption className="sr-only">{t("title")}</caption>
            <thead className="bg-surface-2 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="w-8" />
                <th scope="col" className="px-3 py-2 text-start font-medium">
                  {t("when")}
                </th>
                <th scope="col" className="px-3 py-2 text-start font-medium">
                  {t("who")}
                </th>
                <th scope="col" className="px-3 py-2 text-start font-medium">
                  {t("action")}
                </th>
                <th scope="col" className="px-3 py-2 text-start font-medium">
                  {t("record")}
                </th>
                <th scope="col" className="px-3 py-2 text-start font-medium">
                  {t("ip")}
                </th>
              </tr>
            </thead>
            <tbody>
              {query.isPending ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    {t("loading")}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    {filter ? t("noMatch") : t("empty")}
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const changes = auditChanges(r.oldValues, r.newValues);
                  const expanded = open === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr className={cn("border-t border-border", expanded && "bg-surface-2/50")}>
                        <td className="px-1">
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
                        <td className="whitespace-nowrap px-3 py-2" dir="ltr">
                          {formatInCompanyTz(r.createdAt, zone)}
                        </td>
                        <td className="px-3 py-2">
                          {r.userId ? (userName.get(r.userId) ?? `#${r.userId}`) : t("system")}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge tone={actionTone(r.action)}>{r.action}</StatusBadge>
                        </td>
                        <td className="px-3 py-2">
                          {auditSubject(r.auditableType) || "—"}
                          {r.auditableId ? (
                            <span className="text-muted-foreground" dir="ltr">
                              {" "}
                              #{r.auditableId}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground" dir="ltr">
                          {r.ipAddress ?? "—"}
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="border-t border-border/60 bg-surface-2/30">
                          <td />
                          <td colSpan={5} className="px-3 py-2">
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
      )}

      {info && info.lastPage > 1 ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || query.isFetching}
          >
            <ChevronLeft className="rtl:rotate-180" />
            {t("newer")}
          </Button>
          <span className="text-[13px] text-muted-foreground" dir="ltr">
            {t("pageOf", { page, last: info.lastPage })}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.min(info.lastPage, p + 1))}
            disabled={page >= info.lastPage || query.isFetching}
          >
            {t("older")}
            <ChevronRight className="rtl:rotate-180" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
