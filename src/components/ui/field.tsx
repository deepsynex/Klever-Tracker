"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Label } from "./label";

/**
 * Label + control + hint/error. `error` is a translation key under `validation.*`, or a server
 * message prefixed with "server:", which is shown as-is.
 */
export function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("validation");
  const message = error ? (error.startsWith("server:") ? error.slice(7) : t(error)) : undefined;

  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {message ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {message}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
