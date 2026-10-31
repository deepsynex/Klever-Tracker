import { cn } from "@/lib/utils";

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Klever Tracker";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg bg-primary", className)} aria-hidden>
      <svg
        viewBox="0 0 24 24"
        className="size-[18px]"
        fill="none"
        stroke="var(--primary-fg)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2.5 19 20l-7-3.6L5 20Z" />
      </svg>
    </span>
  );
}

export function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark className={subtitle ? "size-10 rounded-xl shadow-[0_8px_18px_-8px_rgb(11_110_105/0.7)]" : undefined} />
      <span className="grid leading-tight">
        <span className={subtitle ? "text-lg font-bold tracking-tight" : "text-[15px] font-bold"}>{APP_NAME}</span>
        {subtitle ? (
          <span className="hidden text-[9px] font-semibold uppercase tracking-[0.08em] text-subtle sm:block">
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
  );
}
