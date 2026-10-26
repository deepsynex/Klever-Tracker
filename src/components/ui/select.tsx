import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-9 w-full min-w-0 rounded-ctl border border-border-strong bg-surface px-2.5 text-sm text-foreground",
        "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
        "aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
