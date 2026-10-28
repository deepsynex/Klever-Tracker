"use client";

import { useTranslations } from "next-intl";
import { SelectWithAdd } from "@/components/masters/pickers";
import { CREATE_DRIVER } from "@/lib/graphql/vehicle-management";
import { useVmLookups, useVmMutations } from "@/lib/vehicle-management/use-vm";
import { validateDriverQuickAdd } from "@/lib/vehicle-management/validation";

/**
 * Driver dropdown with a "+" quick add (name, mobile, licence no., employee ID). A new driver is
 * saved, the lists refresh, and it's selected. Used by the vehicle, allocation and maintenance forms.
 */
export function DriverSelect({
  id,
  value,
  onChange,
  required,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (driverId: string) => void;
  /** Required fields show "Choose…" instead of "None" for the empty option. */
  required?: boolean;
  invalid?: boolean;
}) {
  const t = useTranslations("masters.common");
  const lookups = useVmLookups();
  const { run, refresh } = useVmMutations();

  return (
    <SelectWithAdd
      id={id}
      value={value}
      onChange={onChange}
      invalid={invalid}
      placeholder={required ? t("choose") : t("none")}
      options={lookups.drivers.map((d) => ({ id: d.id, label: d.name }))}
      addLabel={t("addDriver")}
      validate={validateDriverQuickAdd}
      addFields={[
        { key: "name", label: t("driverFields.name"), required: true },
        { key: "mobile", label: t("driverFields.mobile"), required: true, type: "tel" },
        { key: "licenceNo", label: t("driverFields.licenceNo") },
        { key: "employeeId", label: t("driverFields.employeeId") },
      ]}
      onCreate={async (vals) => {
        const res = await run<{ createDriver: { id: string } }>(CREATE_DRIVER, {
          companyId: lookups.companyId,
          name: vals.name,
          mobile: vals.mobile,
          licenceNo: vals.licenceNo || null,
          employeeId: vals.employeeId || null,
        });
        await refresh();
        return res.createDriver.id;
      }}
    />
  );
}
