"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import type { AxleConfiguration } from "@/lib/graphql/tyres";

/**
 * Labels for the tyre reference data. Axle layouts come from the API in English only, so they're
 * translated by code ("6x4"), falling back to the API's name for a layout added later.
 */
export function useTyreLabels() {
  const t = useTranslations("masters.tyres");
  const axle = useCallback(
    (cfg: Pick<AxleConfiguration, "code" | "name"> | null | undefined) => {
      if (!cfg) return "—";
      return t.has(`axles.${cfg.code}`) ? t(`axles.${cfg.code}`) : cfg.name;
    },
    [t],
  );
  const application = useCallback(
    (value: string | null | undefined) =>
      !value ? "—" : t.has(`applications.${value}`) ? t(`applications.${value}`) : value,
    [t],
  );
  return { axle, application };
}
