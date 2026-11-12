import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { FIELD_BASE } from "./field-styles";

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn("h-9", FIELD_BASE, className)} {...props} />;
}
