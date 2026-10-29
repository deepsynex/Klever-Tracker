"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { ChildRowsEditor, type ChildField } from "@/components/masters/child-rows";
import { PageHeader } from "@/components/masters/page-header";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { CREATE_SENSOR, DELETE_SENSOR, SENSORS, UPDATE_SENSOR, type SensorsResult } from "@/lib/graphql/vehicle-management";
import { useErrorText, useVmLookups, useVmQuery } from "@/lib/vehicle-management/use-vm";
import { validateSensorRow } from "@/lib/vehicle-management/validation";

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
      map.set(s.vehicleId, [...(map.get(s.vehicleId) ?? []), s].sort((a, b) => a.sortOrder - b.sortOrder));
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
    <div className="grid gap-4">
      <PageHeader title={t("title")} description={t("description")} />
      {sensors.error ? <Alert tone="error">{errorText(sensors.error)}</Alert> : null}
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="max-w-xs" />
      {lookups.isPending || sensors.isPending ? (
        <p className="text-[13px] text-muted-foreground">{t("loading")}</p>
      ) : vehicles.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-6 text-center text-[13px] text-muted-foreground">{t("noVehicles")}</p>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {vehicles.map((v) => (
            <section key={v.id} className="grid gap-2 rounded-card border border-border bg-surface p-4" aria-labelledby={`ts-${v.id}`}>
              <h2 id={`ts-${v.id}`} className="flex items-baseline justify-between gap-2 text-sm font-semibold">
                <span dir="ltr">{lookups.vehicleLabel(v.id)}</span>
                <span className="text-xs font-normal text-subtle">{t("count", { count: byVehicle.get(v.id)?.length ?? 0 })}</span>
              </h2>
              <ChildRowsEditor
                rows={byVehicle.get(v.id) ?? []}
                fields={fields}
                newRow={{ label: t("defaultName", { n: (byVehicle.get(v.id)?.length ?? 0) + 1 }), sortOrder: String((byVehicle.get(v.id)?.length ?? 0) + 1) }}
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
