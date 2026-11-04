"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { ChildRowsEditor, type ChildField } from "@/components/masters/child-rows";
import { PANEL } from "@/components/masters/data-table";
import { PageHeader } from "@/components/masters/page-header";
import { Alert } from "@/components/ui/alert";
import {
  CREATE_SENSOR,
  DELETE_SENSOR,
  SENSORS,
  UPDATE_SENSOR,
  type SensorsResult,
} from "@/lib/graphql/vehicle-management";
import { useErrorText, useVmLookups, useVmQuery } from "@/lib/vehicle-management/use-vm";
import { validateSensorRow } from "@/lib/vehicle-management/validation";
import { cn } from "@/lib/utils";

const TEMPERATURE_TYPES = new Set(["temperature", "ble_temperature_humidity"]);

/**
 * 5. Temp Sensor: one block per vehicle with its temperature sensors (name, low/high limit °C).
 * Same VehicleSensor API as the vehicle form, and not capped at three sensors.
 */
export function TempSensorsScreen() {
  const t = useTranslations("masters.vm.tempSensors");
  const lookups = useVmLookups();
  const sensors = useVmQuery<SensorsResult>("sensors", SENSORS);
  const errorText = useErrorText();
  const [query, setQuery] = useState("");

  const byVehicle = useMemo(() => {
    const map = new Map<string, SensorsResult["vehicleSensors"]["data"]>();
    for (const s of sensors.data?.vehicleSensors.data ?? []) {
      if (!TEMPERATURE_TYPES.has(s.sensorType)) continue;
      map.set(
        s.vehicleId,
        [...(map.get(s.vehicleId) ?? []), s].sort((a, b) => a.sortOrder - b.sortOrder),
      );
    }
    return map;
  }, [sensors.data]);

  const vehicles = lookups.vehicles.filter((v) =>
    `${v.plateNo} ${v.vehicleName ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const fields: ChildField[] = [
    { key: "label", label: t("name"), type: "text", required: true },
    { key: "lowLimit", label: t("low"), type: "number" },
    { key: "highLimit", label: t("high"), type: "number" },
    { key: "ioIndex", label: t("ioIndex"), type: "int" },
    { key: "sortOrder", label: t("sortOrder"), type: "int", omitIfEmpty: true },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      {sensors.error ? <Alert tone="error">{errorText(sensors.error)}</Alert> : null}
      <div className={cn(PANEL, "flex flex-wrap items-center gap-3 p-3")}>
        <div className="relative w-full sm:w-80">
          <Search
            className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
            className="h-11 w-full rounded-xl border border-border/80 bg-surface ps-10 pe-3 text-sm text-foreground shadow-2xs placeholder:text-muted-foreground/70 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
          />
        </div>
      </div>
      {lookups.isPending || sensors.isPending ? (
        <p className="text-[13px] text-muted-foreground">{t("loading")}</p>
      ) : vehicles.length === 0 ? (
        <p className="rounded-2xl border border-border/70 bg-surface shadow-sm p-6 text-center text-[13px] text-muted-foreground">
          {t("noVehicles")}
        </p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {vehicles.map((v) => (
            <section
              key={v.id}
              className="grid content-start gap-3 rounded-2xl border border-border/70 bg-surface p-5 shadow-sm"
              aria-labelledby={`ts-${v.id}`}
            >
              <h2 id={`ts-${v.id}`} className="flex items-baseline justify-between gap-2 text-sm font-semibold">
                <span dir="ltr">{lookups.vehicleLabel(v.id)}</span>
                <span className="text-xs font-normal text-subtle">
                  {t("count", { count: byVehicle.get(v.id)?.length ?? 0 })}
                </span>
              </h2>
              <ChildRowsEditor
                rows={byVehicle.get(v.id) ?? []}
                fields={fields}
                newRow={{
                  label: t("defaultName", { n: (byVehicle.get(v.id)?.length ?? 0) + 1 }),
                  sortOrder: String((byVehicle.get(v.id)?.length ?? 0) + 1),
                }}
                createVariables={{ vehicleId: v.id, sensorType: "temperature" }}
                ops={{ create: CREATE_SENSOR, update: UPDATE_SENSOR, remove: DELETE_SENSOR }}
                validate={validateSensorRow}
                readOnly={!lookups.allow("other", "edit")}
                addLabel={t("add")}
                emptyText={t("empty")}
              />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
