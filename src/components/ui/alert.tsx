import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const tones = {
  error: "border-destructive/40 bg-destructive/10 text-foreground",
  success: "border-moving/40 bg-moving/10 text-foreground",
  info: "border-info/30 bg-info/10 text-foreground",
  warning: "border-sand/40 bg-sand-soft text-foreground",
};

export function Alert({ tone = "info", className, ...props }: ComponentProps<"div"> & { tone?: keyof typeof tones }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-ctl border px-3 py-2 text-[13px]", tones[tone], className)}
      {...props}
    />
  );
}
