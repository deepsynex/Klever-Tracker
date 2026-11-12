"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, type ReactElement } from "react";
import { routing, type AppLocale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * Language switch: two buttons with flags (English / Arabic), the current one highlighted.
 * Flags are inline SVG because Windows doesn't draw flag emoji (it shows "GB" / "AE").
 *
 * Switching does a full page load of the same page in the other language: the language is the
 * root of every route, so a client-side switch re-renders the root layout in the browser (React
 * then warns about its inline theme script), and a fresh load also resets dir, fonts and dates.
 */
const OPTIONS: Array<{ locale: AppLocale; short: string; Flag: () => ReactElement }> = [
  { locale: "en", short: "EN", Flag: UkFlag },
  { locale: "ar", short: "عربي", Flag: UaeFlag },
];

export function LocaleSwitcher() {
  const t = useTranslations("locale");
  const locale = useLocale() as AppLocale;
  const [pending, setPending] = useState(false);

  const switchTo = (next: AppLocale) => {
    const { pathname, search, hash } = window.location;
    const prefix = new RegExp(`^/(${routing.locales.join("|")})(?=/|$)`);
    const path = prefix.test(pathname) ? pathname.replace(prefix, `/${next}`) : `/${next}${pathname}`;
    setPending(true);
    window.location.assign(path + search + hash);
  };

  return (
    <div role="group" aria-label={t("switch")} className="inline-flex items-center gap-0.5 rounded-xl border border-border/70 bg-surface-2/70 p-0.5">
      {OPTIONS.map(({ locale: option, short, Flag }) => {
        const active = option === locale;
        return (
          <button
            key={option}
            type="button"
            lang={option}
            aria-pressed={active}
            title={t(`name.${option}`)}
            disabled={pending}
            onClick={() => {
              if (!active) switchTo(option);
            }}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold transition-colors disabled:opacity-60",
              active ? "bg-surface text-foreground shadow-sm ring-1 ring-border/70" : "text-muted-foreground hover:bg-surface hover:text-foreground",
            )}
          >
            <Flag />
            <span>{short}</span>
          </button>
        );
      })}
    </div>
  );
}

function UkFlag() {
  return (
    <svg viewBox="0 0 60 30" className="h-3.5 w-[21px] shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgb(0_0_0/0.08)]" aria-hidden>
      <clipPath id="uk-flag-clip">
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#uk-flag-clip)" stroke="#C8102E" strokeWidth="4" />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}

function UaeFlag() {
  return (
    <svg viewBox="0 0 12 6" className="h-3.5 w-[21px] shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgb(0_0_0/0.08)]" aria-hidden>
      <rect width="12" height="2" fill="#00732F" />
      <rect y="2" width="12" height="2" fill="#FFFFFF" />
      <rect y="4" width="12" height="2" fill="#000000" />
      <rect width="3" height="6" fill="#FF0000" />
    </svg>
  );
}
