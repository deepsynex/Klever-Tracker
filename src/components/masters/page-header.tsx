import type { ComponentProps, ReactNode } from "react";
import { Select, type SelectProps } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Title row for a master screen, laid out like Vehicle details: a bold heading, a one-line
 * description and the main actions (rounded-xl, 40px tall).
 */
export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="grid min-w-0 gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="max-w-[80ch] text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 [&_[data-slot=button]]:h-10 [&_[data-slot=button]]:rounded-xl [&_[data-slot=button]]:px-4 [&_[data-slot=button]]:font-semibold [&_[data-slot=button]]:shadow-sm">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export type KpiTone = "primary" | "ok" | "warn" | "bad" | "muted";

export type Kpi = {
  key: string;
  label: ReactNode;
  value: ReactNode;
  icon: ReactNode;
  tone?: KpiTone;
  /** Tints the whole card, for a figure that needs attention (like "Maintenance due" on Vehicle details). */
  highlight?: boolean;
};

const KPI_ICON: Record<KpiTone, string> = {
  primary: "bg-primary-soft text-primary",
  ok: "bg-moving/12 text-moving",
  warn: "bg-idle/12 text-idle",
  bad: "bg-destructive/10 text-destructive",
  muted: "bg-surface-2 text-muted-foreground",
};

/** Row of KPI cards under the page header, the same as on Vehicle details. */
export function KpiCards({ items, loading }: { items: Kpi[]; loading?: boolean }) {
  const cols = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[Math.min(items.length, 4) as 1 | 2 | 3 | 4];
  return (
    <div className={cn("grid grid-cols-1 gap-4", cols)}>
      {items.map((k) => (
        <div
          key={k.key}
          className={cn(
            "flex items-center gap-3.5 rounded-2xl border p-4 shadow-sm",
            k.highlight ? "border-destructive/20 bg-destructive/[0.04]" : "border-border/70 bg-surface",
          )}
        >
          <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5 [&_svg]:stroke-[1.75]", KPI_ICON[k.tone ?? "primary"])}>
            {k.icon}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-muted-foreground">{k.label}</p>
            {loading ? (
              <div className="mt-1.5 h-6 w-10 animate-pulse rounded bg-surface-3" aria-hidden />
            ) : (
              <p className="mt-0.5 text-2xl font-bold text-foreground tabular-nums">{k.value}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Compact labelled dropdown for a list's filter bar ("Type / All" on Vehicle details): the label
 * sits above the value inside one 44px rounded-xl box.
 */
export function FilterSelect({ label, className, children, ...props }: SelectProps & { label: ReactNode }) {
  return (
    <label
      className={cn(
        "relative block min-w-[120px] rounded-xl border border-border/80 bg-surface px-3 py-1 text-start shadow-2xs focus-within:border-primary focus-within:ring-1 focus-within:ring-primary",
        className,
      )}
    >
      <span className="block text-[11px] leading-tight font-medium text-muted-foreground">{label}</span>
      <Select variant="bare" {...props}>
        {children}
      </Select>
    </label>
  );
}

/** A date (or other input) in the same labelled 44px box as FilterSelect. */
export function FilterInput({ label, className, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label
      className={cn(
        "block min-w-[140px] rounded-xl border border-border/80 bg-surface px-3 py-1 text-start shadow-2xs focus-within:border-primary focus-within:ring-1 focus-within:ring-primary",
        className,
      )}
    >
      <span className="block text-[11px] leading-tight font-medium text-muted-foreground">{label}</span>
      <input className="w-full bg-transparent text-sm font-semibold text-foreground focus:outline-none" {...props} />
    </label>
  );
}

/** A titled group of form fields laid out in a responsive grid. */
export function FormSection({
  title,
  description,
  columns = 2,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  columns?: 1 | 2 | 3;
  children: ReactNode;
}) {
  const cols = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3" }[columns];
  return (
    <fieldset className="grid gap-3 border-b border-border pb-5 last:border-b-0 last:pb-0">
      <legend className="mb-1 text-sm font-semibold">{title}</legend>
      {description ? <p className="-mt-2 text-xs text-subtle">{description}</p> : null}
      <div className={`grid gap-3 ${cols}`}>{children}</div>
    </fieldset>
  );
}

/** Small coloured status pill. */
export function StatusBadge({ tone, children }: { tone: "ok" | "warn" | "bad" | "muted" | "info"; children: ReactNode }) {
  // Bordered pill, as on Vehicle details.
  const tones = {
    ok: "border-moving/25 bg-moving/10 text-moving",
    warn: "border-sand/25 bg-sand-soft text-sand",
    bad: "border-destructive/25 bg-destructive/10 text-destructive",
    muted: "border-border bg-surface-2 text-muted-foreground",
    info: "border-primary/25 bg-primary-soft text-primary",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}
