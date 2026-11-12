import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { FIELD_BASE, SELECT_ARROW } from "./field-styles";

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select data-slot="select" className={cn("h-9", FIELD_BASE, SELECT_ARROW, className)} {...props}>
      {children}
    </select>
  );
}
