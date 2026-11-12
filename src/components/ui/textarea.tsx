import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { FIELD_BASE } from "./field-styles";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn("min-h-20 py-2", FIELD_BASE, className)} {...props} />;
}
