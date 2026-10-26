"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

type ThemeMode = "auto" | "light" | "dark";
const STORAGE_KEY = "kt-theme";
const listeners = new Set<() => void>();

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

function applyMode(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Inline script for <head>: applies the saved theme before first paint to avoid a flash. */
export const themeInitScript = `(function(){try{var m=localStorage.getItem('${STORAGE_KEY}');if(m==='light'||m==='dark')document.documentElement.setAttribute('data-theme',m)}catch(e){}})()`;

export function ThemeToggle() {
  const t = useTranslations("theme");
  const mode = useSyncExternalStore(subscribe, readMode, () => "auto" as ThemeMode);
  const next: ThemeMode = mode === "auto" ? "light" : mode === "light" ? "dark" : "auto";
  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t("switchTo", { mode: t(next) })}
      title={t("current", { mode: t(mode) })}
      onClick={() => {
        try {
          if (next === "auto") localStorage.removeItem(STORAGE_KEY);
          else localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // Storage can be unavailable (private mode); the theme still applies for this page.
        }
        applyMode(next);
        listeners.forEach((l) => l());
      }}
    >
      <Icon />
    </Button>
  );
}
