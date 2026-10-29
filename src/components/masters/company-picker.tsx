"use client";

import { Building2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Select } from "@/components/ui/select";
import { usePathname } from "@/i18n/navigation";
import { ALL_COMPANIES, useCompanyScope } from "@/lib/vehicle-management/company-scope";
import { useVmLookups } from "@/lib/vehicle-management/use-vm";

/**
 * Company picker for platform accounts (no company of their own). Hidden for company users,
 * who only ever see their own company. "All companies" is view only: new records need a company.
 * `hideOn`: paths where the choice doesn't apply (e.g. Change Password).
 */
export function CompanyPicker({ hideOn = [] }: { hideOn?: string[] }) {
  const t = useTranslations("masters.vm.company");
  const { setSelected } = useCompanyScope();
  const lookups = useVmLookups();
  const pathname = usePathname();
  if (!lookups.isPlatform || hideOn.includes(pathname)) return null;

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface px-3 py-2">
        <Building2 className="size-4 text-primary" aria-hidden />
        <label htmlFor="vm-company" className="text-[13px] font-semibold">
          {t("label")}
        </label>
        <Select
          id="vm-company"
          value={lookups.companyId ?? ALL_COMPANIES}
          onChange={(e) => setSelected(e.target.value)}
          className="h-8 w-auto min-w-56"
        >
          <option value={ALL_COMPANIES}>{t("all")}</option>
          {lookups.companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <span className="text-xs text-subtle">{t("platformHint")}</span>
      </div>
      {!lookups.companyId ? <Alert tone="info">{t("viewOnly")}</Alert> : null}
    </div>
  );
}
