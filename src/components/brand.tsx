import { cn } from "@/lib/utils";

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Klever Tracker";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg bg-primary", className)} aria-hidden>
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="var(--primary-fg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2.5 19 20l-7-3.6L5 20Z" />
      </svg>
    </span>
  );
}

export function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark />
      <span className="grid leading-tight">
        <span className="text-[15px] font-bold">{APP_NAME}</span>
        {subtitle ? <span className="text-xs text-muted-foreground">{subtitle}</span> : null}
      </span>
    </span>
  );
}
