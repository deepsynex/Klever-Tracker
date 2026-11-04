"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Pencil, Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Numbers and codes: monospace, aligned to the end. */
  numeric?: boolean;
  className?: string;
  /** Makes the column sortable by clicking its header. */
  sortValue?: (row: T) => string | number | null | undefined;
};

const PAGE_SIZES = [10, 25, 50, 100];

/** Card surface shared by the toolbar and the table, the same as on Vehicle details. */
export const PANEL = "rounded-2xl border border-border/70 bg-surface shadow-sm";

/**
 * Toolbar controls (search, filters, buttons) are 44px tall with rounded-xl corners, matching
 * Vehicle details. Buttons passed in `toolbar` / `filters` pick this up automatically.
 */
const TOOLBAR_CONTROLS =
  "[&_[data-slot=button]]:h-11 [&_[data-slot=button]]:rounded-xl [&_[data-slot=button]]:border-border/80 [&_[data-slot=button]]:px-3.5 [&_[data-slot=button]]:shadow-2xs";

/**
 * List for master screens, laid out like Vehicle details: a toolbar card (search, filters, row
 * count, actions) and a table card with sortable headers, row actions and a "Show N entries"
 * pager. Searching and paging are client side. `searchText` returns the text a row is searched by.
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
  filters,
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
  /** Actions on the end side of the toolbar (export, upload…). */
  toolbar?: ReactNode;
  /** Filter controls next to the search box. */
  filters?: ReactNode;
  emptyText?: ReactNode;
  caption: string;
}) {
  const t = useTranslations("masters.common");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !searchText) return rows;
    return rows.filter((r) => searchText(r).toLowerCase().includes(q));
  }, [rows, query, searchText]);

  const sorted = useMemo(() => {
    const col = sort && columns.find((c) => c.key === sort.key);
    if (!sort || !col?.sortValue) return filtered;
    const value = col.sortValue;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      // Empty values always sort last.
      if (x == null || x === "") return y == null || y === "" ? 0 : 1;
      if (y == null || y === "") return -1;
      const cmp =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" });
      return cmp * factor;
    });
  }, [filtered, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const visible = sorted.slice(current * pageSize, current * pageSize + pageSize);
  const hasActions = Boolean(onEdit || onDelete || rowActions);

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));

  return (
    <div className="grid min-w-0 gap-4">
      <div className={cn(PANEL, TOOLBAR_CONTROLS, "flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between")}>
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          {searchText ? (
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder={t("search")}
                aria-label={t("search")}
                className="h-11 w-full rounded-xl border border-border/80 bg-surface ps-10 pe-3 text-sm text-foreground shadow-2xs placeholder:text-muted-foreground/70 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>
          ) : null}
          {filters}
        </div>
        <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">
          <span className="text-sm font-medium whitespace-nowrap text-muted-foreground">{t("rowCount", { count: sorted.length })}</span>
          {toolbar}
        </div>
      </div>

      {error ? (
        <Alert tone="error">{error}</Alert>
      ) : (
        <div className={cn(PANEL, "min-w-0 overflow-hidden")}>
          {/* `relative`: the scroll box must contain absolutely positioned content (e.g. sr-only
              text), or that content escapes it and widens the whole page. */}
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-sm">
              <caption className="sr-only">{caption}</caption>
              <thead>
                <tr className="border-b border-border/70">
                  {columns.map((c) => {
                    const active = sort?.key === c.key ? sort.dir : null;
                    const SortIcon = active === "asc" ? ArrowUp : active === "desc" ? ArrowDown : ArrowUpDown;
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : undefined}
                        className={cn(
                          "px-3 py-3.5 text-xs font-semibold whitespace-nowrap text-muted-foreground first:ps-5",
                          c.numeric ? "text-end" : "text-start",
                          c.className,
                        )}
                      >
                        {c.sortValue ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(c.key)}
                            className="group inline-flex items-center gap-1.5 hover:text-foreground"
                          >
                            {c.header}
                            <SortIcon
                              className={cn("size-3", active ? "text-primary" : "text-muted-foreground/60 group-hover:text-foreground")}
                              aria-hidden
                            />
                          </button>
                        ) : (
                          c.header
                        )}
                      </th>
                    );
                  })}
                  {hasActions ? (
                    <th scope="col" className="px-3 py-3.5 pe-5 text-end text-xs font-semibold text-muted-foreground">
                      {t("actions")}
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(4)].map((_, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0" aria-hidden>
                      {columns.map((c) => (
                        <td key={c.key} className="px-3 py-4 first:ps-5">
                          <div className="h-3 w-3/4 animate-pulse rounded bg-surface-3" />
                        </td>
                      ))}
                      {hasActions ? <td /> : null}
                    </tr>
                  ))
                ) : visible.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + (hasActions ? 1 : 0)} className="px-3 py-12 text-center text-muted-foreground">
                      {query ? t("noMatches") : (emptyText ?? t("empty"))}
                    </td>
                  </tr>
                ) : (
                  visible.map((row) => (
                    <tr key={row.id} className="border-b border-border/50 transition-colors last:border-0 hover:bg-surface-2/40">
                      {columns.map((c) => (
                        <td
                          key={c.key}
                          className={cn(
                            "px-3 py-3.5 align-middle text-foreground first:ps-5",
                            c.numeric && "text-end font-mono tabular-nums",
                            c.className,
                          )}
                        >
                          {c.cell(row)}
                        </td>
                      ))}
                      {hasActions ? (
                        <td className="px-3 py-2 pe-5 text-end align-middle whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            {rowActions?.(row)}
                            {onEdit ? (
                              <RowAction label={t("edit")} onClick={() => onEdit(row)}>
                                <Pencil />
                              </RowAction>
                            ) : null}
                            {onDelete ? (
                              <RowAction label={t("delete")} onClick={() => onDelete(row)} danger>
                                <Trash2 />
                              </RowAction>
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

          {!loading && sorted.length > 0 ? (
            <Pager
              page={current}
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

/** Icon button for a table row, styled like the row actions on Vehicle details. */
export function RowAction({
  label,
  onClick,
  danger,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40 [&_svg]:size-4",
        danger && "hover:bg-destructive/10 hover:text-destructive",
      )}
    >
      {children}
    </button>
  );
}

/** "Show [10] entries" on the start side, numbered pages on the end side. */
export function Pager({
  page,
  pageCount,
  pageSize,
  onPage,
  onPageSize,
}: {
  /** Zero-based. */
  page: number;
  pageCount: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const t = useTranslations("masters.common");
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-border/70 px-5 py-4 text-sm sm:flex-row">
      <label className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
        <span>{t("show")}</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          className="h-8 cursor-pointer rounded-lg border border-border/80 bg-surface px-2 text-xs font-semibold text-foreground focus:border-primary focus:outline-none"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span>{t("entries")}</span>
      </label>
      <nav className="flex items-center gap-1" aria-label={t("pageOf", { page: page + 1, total: pageCount })}>
        <PagerButton label={t("previous")} disabled={page === 0} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="size-4 rtl:rotate-180" />
        </PagerButton>
        {pageNumbers(page, pageCount).map((p, i) =>
          p === null ? (
            <span key={`gap-${i}`} className="px-1 text-muted-foreground">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPage(p)}
              aria-current={p === page ? "page" : undefined}
              className={cn(
                "size-8 rounded-lg text-xs font-semibold transition-colors",
                p === page ? "bg-primary text-primary-foreground shadow-2xs" : "border border-border/80 text-foreground hover:bg-surface-2",
              )}
            >
              {p + 1}
            </button>
          ),
        )}
        <PagerButton label={t("next")} disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)}>
          <ChevronRight className="size-4 rtl:rotate-180" />
        </PagerButton>
      </nav>
    </div>
  );
}

function PagerButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex size-8 items-center justify-center rounded-lg border border-border/80 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** Zero-based page numbers to show, with `null` for a gap: first, last and two around the current page. */
export function pageNumbers(page: number, pageCount: number): Array<number | null> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i);
  const keep = new Set([0, pageCount - 1, page - 1, page, page + 1].filter((p) => p >= 0 && p < pageCount));
  const out: Array<number | null> = [];
  let prev = -1;
  for (const p of [...keep].sort((a, b) => a - b)) {
    if (p - prev > 1) out.push(null);
    out.push(p);
    prev = p;
  }
  return out;
}
