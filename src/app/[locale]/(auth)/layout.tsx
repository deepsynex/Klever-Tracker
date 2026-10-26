import { useTranslations } from "next-intl";
import { Brand } from "@/components/brand";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: LayoutProps<"/[locale]">) {
  const t = useTranslations("auth");

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-10">
        <RoutePattern />
        <div className="relative flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-primary-foreground/15" aria-hidden>
            <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2.5 19 20l-7-3.6L5 20Z" />
            </svg>
          </span>
          <span className="text-[15px] font-bold">{process.env.NEXT_PUBLIC_APP_NAME || "Klever Tracker"}</span>
        </div>
        <p className="relative max-w-sm text-2xl font-semibold leading-snug">{t("tagline")}</p>
      </aside>

      <div className="flex min-w-0 flex-col px-4 py-5 sm:px-8">
        <div className="flex items-center justify-between gap-3">
          <span className="lg:invisible">
            <Brand />
          </span>
          <span className="flex items-center gap-1">
            <LocaleSwitcher />
            <ThemeToggle />
          </span>
        </div>
        <main className="grid flex-1 place-items-center py-10">
          <div className="w-full max-w-[380px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

/** Decorative road grid echoing the live map (ui-demo.html). */
function RoutePattern() {
  return (
    <svg className="pointer-events-none absolute inset-0 size-full opacity-[0.14]" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        <path d="M-40 760 L640 180" strokeWidth="10" />
        <path d="M60 860 L700 300" strokeWidth="10" />
        <path d="M-60 520 L520 -40" strokeWidth="4" />
        <path d="M120 120 L560 640" strokeWidth="4" />
        <path d="M-20 300 L380 820" strokeWidth="4" />
        <circle cx="300" cy="520" r="54" strokeWidth="3" strokeDasharray="6 8" />
      </g>
      <g fill="currentColor">
        <circle cx="236" cy="473" r="9" />
        <circle cx="430" cy="400" r="9" />
        <circle cx="150" cy="560" r="9" />
      </g>
    </svg>
  );
}
