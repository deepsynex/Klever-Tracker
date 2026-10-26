import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "ar"],
  defaultLocale: "en",
  localePrefix: "always",
});

export type AppLocale = (typeof routing.locales)[number];

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (routing.locales as readonly string[]).includes(value);
}

export function directionOf(locale: AppLocale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}
