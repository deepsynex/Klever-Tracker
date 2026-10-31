"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";

export function LocaleSwitcher() {
  const t = useTranslations("locale");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const target: AppLocale = locale === "en" ? "ar" : "en";

  return (
    <button
      type="button"
      disabled={pending}
      lang={target}
      aria-label={t("switch")}
      onClick={() => startTransition(() => router.replace(pathname, { locale: target }))}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 text-[13px] font-medium transition-colors cursor-pointer"
    >
      <svg viewBox="0 0 24 24" className="size-4 stroke-current fill-none" strokeWidth="1.8">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
      <span>{locale === "en" ? "English" : "العربية"}</span>
      <svg viewBox="0 0 24 24" className="size-3.5 stroke-current fill-none" strokeWidth="2.2">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
}
