import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Native checkbox with a label, themed with the primary colour. */
export function Checkbox({
  label,
  className,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { label?: ReactNode }) {
  const box = (
    <input
      type="checkbox"
      className={cn(
        "size-4 shrink-0 cursor-pointer rounded border-border-strong accent-primary disabled:cursor-not-allowed",
        !label && className,
      )}
      {...props}
    />
  );
  if (!label) return box;
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm", className)}>
      {box}
      <span className="min-w-0">{label}</span>
    </label>
  );
}
