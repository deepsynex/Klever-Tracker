"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
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
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      lang={target}
      aria-label={t("switch")}
      onClick={() => startTransition(() => router.replace(pathname, { locale: target }))}
    >
      {t(`name.${target}`)}
    </Button>
  );
}
