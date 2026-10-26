import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-ctl border border-border-strong bg-surface px-2.5 text-sm text-foreground placeholder:text-subtle",
        "aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
