import type { ReactNode } from "react";

/** Title row for a master screen: heading, one-line description and the main actions. */
export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="max-w-[80ch] text-[13px] text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
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
  const tones = {
    ok: "bg-moving/12 text-moving",
    warn: "bg-sand-soft text-sand",
    bad: "bg-destructive/12 text-destructive",
    muted: "bg-surface-3 text-muted-foreground",
    info: "bg-primary-soft text-primary",
  };
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}
