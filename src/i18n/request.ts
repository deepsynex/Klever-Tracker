import { getRequestConfig } from "next-intl/server";
import { locale as rootLocale } from "next/root-params";
import { isAppLocale, routing } from "./routing";

export default getRequestConfig(async ({ locale }) => {
  let resolved = locale;
  if (!resolved) {
    try {
      resolved = await rootLocale();
    } catch {
      // Root params aren't available outside Server Components (e.g. in Server Actions).
      resolved = undefined;
    }
  }
  const finalLocale = isAppLocale(resolved) ? resolved : routing.defaultLocale;

  return {
    locale: finalLocale,
    timeZone: "Asia/Dubai",
    messages: (await import(`../../messages/${finalLocale}.json`)).default,
  };
});
