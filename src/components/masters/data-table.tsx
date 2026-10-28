"use client";

import { ChevronLeft, ChevronRight, Pencil, Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Numbers and codes: monospace, aligned to the end. */
  numeric?: boolean;
  className?: string;
};

const PAGE_SIZE = 25;

/**
 * List table for master screens: search box, client-side paging, loading / empty / error states
 * and Edit / Delete buttons per row. `searchText` returns the text a row is searched by.
 */
export function DataTable<T extends { id: string }>({
  rows,
  columns,
  loading,
  error,
  searchText,
  onEdit,
  onDelete,
  rowActions,
  toolbar,
  emptyText,
  caption,
}: {
  rows: T[];
  columns: Column<T>[];
  loading?: boolean;
  error?: string | null;
  searchText?: (row: T) => string;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  rowActions?: (row: T) => ReactNode;
  toolbar?: ReactNode;
  emptyText?: ReactNode;
  caption: string;
}) {
  const t = useTranslations("masters.common");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !searchText) return rows;
    return rows.filter((r) => searchText(r).toLowerCase().includes(q));
  }, [rows, query, searchText]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const visible = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const hasActions = Boolean(onEdit || onDelete || rowActions);

  return (
    <div className="grid min-w-0 gap-3 rounded-card border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
        {searchText ? (
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder={t("search")}
              aria-label={t("search")}
              className="h-8 ps-8"
            />
          </div>
        ) : null}
        {toolbar}
        <span className="ms-auto text-xs text-subtle">{t("rowCount", { count: filtered.length })}</span>
      </div>

      {error ? (
        <div className="px-3 pb-3">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-[13px]">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr className="border-b border-border bg-surface-2/60 text-start text-xs text-muted-foreground">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={cn("px-3 py-2 font-semibold whitespace-nowrap", c.numeric ? "text-end" : "text-start", c.className)}
                  >
                    {c.header}
                  </th>
                ))}
                {hasActions ? (
                  <th scope="col" className="px-3 py-2 text-end font-semibold">
                    <span className="sr-only">{t("actions")}</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0" aria-hidden>
                    {columns.map((c) => (
                      <td key={c.key} className="px-3 py-3">
                        <div className="h-3 w-3/4 animate-pulse rounded bg-surface-3" />
                      </td>
                    ))}
                    {hasActions ? <td /> : null}
                  </tr>
                ))
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (hasActions ? 1 : 0)} className="px-3 py-10 text-center text-muted-foreground">
                    {query ? t("noMatches") : (emptyText ?? t("empty"))}
                  </td>
                </tr>
              ) : (
                visible.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn("px-3 py-2.5 align-middle", c.numeric && "text-end font-mono tabular-nums", c.className)}
                      >
                        {c.cell(row)}
                      </td>
                    ))}
                    {hasActions ? (
                      <td className="px-2 py-1.5 text-end whitespace-nowrap">
                        <div className="inline-flex items-center gap-0.5">
                          {rowActions?.(row)}
                          {onEdit ? (
                            <Button variant="ghost" size="icon" className="size-8" onClick={() => onEdit(row)} aria-label={t("edit")} title={t("edit")}>
                              <Pencil />
                            </Button>
                          ) : null}
                          {onDelete ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 hover:text-destructive"
                              onClick={() => onDelete(row)}
                              aria-label={t("delete")}
                              title={t("delete")}
                            >
                              <Trash2 />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 ? (
        <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <span>{t("pageOf", { page: current + 1, total: pageCount })}</span>
          <Button variant="secondary" size="icon" className="size-7" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label={t("previous")}>
            <ChevronLeft className="rtl:rotate-180" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="size-7"
            disabled={current >= pageCount - 1}
            onClick={() => setPage(current + 1)}
            aria-label={t("next")}
          >
            <ChevronRight className="rtl:rotate-180" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
