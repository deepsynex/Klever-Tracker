import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn("grid min-w-0 gap-3 rounded-card border border-border bg-surface p-4", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-wrap items-baseline justify-between gap-2", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("text-sm font-semibold", className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-xs text-subtle", className)} {...props} />;
}
