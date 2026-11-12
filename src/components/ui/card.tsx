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
