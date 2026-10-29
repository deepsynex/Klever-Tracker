"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/masters/confirm-delete";
import { DataTable } from "@/components/masters/data-table";
import { PageHeader } from "@/components/masters/page-header";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import {
  CREATE_DISTANCE_LOG,
  DELETE_DISTANCE_LOG,
  DISTANCE_LOGS,
  UPDATE_DISTANCE_LOG,
  type DistanceLogsResult,
  type VehicleDistanceLog,
} from "@/lib/graphql/vehicle-management";
import { companyToday, dateInputValue, formatDate, kmDriven, numberOrNull, numText, roundMoney } from "@/lib/vehicle-management/helpers";
import { useErrorText, useVmLookups, useVmMutations, useVmQuery } from "@/lib/vehicle-management/use-vm";
import { validateDistance } from "@/lib/vehicle-management/validation";

/** 9. Vehicle Distance: a day-wise odometer log per vehicle. */
export function DistanceScreen() {
  const t = useTranslations("masters.vm.distance");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const list = useVmQuery<DistanceLogsResult>("distance", DISTANCE_LOGS);
  const { run, refresh } = useVmMutations();
  const errorText = useErrorText();
  const [editing, setEditing] = useState<VehicleDistanceLog | "new" | null>(null);
  const [deleting, setDeleting] = useState<VehicleDistanceLog | null>(null);
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const rows = useMemo(
    () =>
      [...(list.data?.vehicleDistanceLogs.data ?? [])]
        .filter((l) => {
          if (!lookups.inScope(lookups.vehicleCompanyId(l.vehicleId))) return false;
          const day = dateInputValue(l.logDate);
          return (!vehicleFilter || l.vehicleId === vehicleFilter) && (!from || day >= from) && (!to || day <= to);
        })
        .sort((a, b) => b.logDate.localeCompare(a.logDate)),
    [list.data, vehicleFilter, from, to, lookups],
  );
  const totalKm = roundMoney(rows.reduce((sum, l) => sum + (l.distanceKm ?? 0), 0));

  return (
    <div className="grid gap-4">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => setEditing("new")} disabled={!lookups.allow("other", "add") || lookups.vehicles.length === 0}>
            <Plus />
            {t("add")}
          </Button>
        }
      />
      <DataTable
        caption={t("title")}
        rows={rows}
        loading={list.isPending}
        error={list.error ? errorText(list.error) : null}
        emptyText={lookups.vehicles.length === 0 ? t("needVehicles") : t("empty")}
        toolbar={
          <>
            <Select value={vehicleFilter} onChange={(e) => setVehicleFilter(e.target.value)} className="h-8 w-auto" aria-label={t("vehicle")}>
              <option value="">{t("allVehicles")}</option>
              {lookups.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {lookups.vehicleLabel(v.id)}
                </option>
              ))}
            </Select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-auto" aria-label={t("from")} />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-auto" aria-label={t("to")} />
            <span className="text-xs text-muted-foreground">{t("totalShown", { km: totalKm })}</span>
          </>
        }
        onEdit={lookups.allow("other", "edit") ? setEditing : undefined}
        onDelete={lookups.allow("other", "delete") ? setDeleting : undefined}
        columns={[
          { key: "account", header: t("account"), cell: (l) => lookups.companyName(lookups.vehicleCompanyId(l.vehicleId)) },
          { key: "vehicle", header: t("vehicle"), cell: (l) => <span dir="ltr">{lookups.vehicleLabel(l.vehicleId)}</span> },
          { key: "start", header: t("start"), numeric: true, cell: (l) => l.startOdometerKm ?? "—" },
          { key: "stop", header: t("stop"), numeric: true, cell: (l) => l.stopOdometerKm ?? "—" },
          { key: "distance", header: t("distance"), numeric: true, cell: (l) => l.distanceKm ?? "—" },
          { key: "date", header: t("date"), cell: (l) => formatDate(l.logDate) },
        ]}
      />

      {editing !== null ? <DistanceSheet log={editing === "new" ? null : editing} logs={list.data?.vehicleDistanceLogs.data ?? []} onClose={() => setEditing(null)} /> : null}

      <ConfirmDelete
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting ? `${lookups.vehicleLabel(deleting.vehicleId)} · ${formatDate(deleting.logDate)}` : ""}
        onConfirm={async () => {
          if (!deleting) return;
          await run(DELETE_DISTANCE_LOG, { id: deleting.id });
          await refresh();
          toast.success(tc("deleted"));
        }}
      />
    </div>
  );
}

function DistanceSheet({ log, logs, onClose }: { log: VehicleDistanceLog | null; logs: VehicleDistanceLog[]; onClose: () => void }) {
  const t = useTranslations("masters.vm.distance");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const { run, refresh, failInto } = useVmMutations();
  const [vehicleId, setVehicleId] = useState(log?.vehicleId ?? "");
  const [date, setDate] = useState(dateInputValue(log?.logDate) || companyToday());
  const [start, setStart] = useState(numText(log?.startOdometerKm));
  const [stop, setStop] = useState(numText(log?.stopOdometerKm));
  const [distance, setDistance] = useState(numText(log?.distanceKm));
  const [distanceTouched, setDistanceTouched] = useState(log !== null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const computed = kmDriven(numberOrNull(start), numberOrNull(stop));
  const shownDistance = distanceTouched ? distance : computed !== null ? String(computed) : "";

  const save = async () => {
    const s = numberOrNull(start);
    const e = numberOrNull(stop);
    const found = validateDistance({ vehicleId, date, start, stop, distance: shownDistance }, logs, companyToday(), log?.id);
    setErrors(found);
    if (Object.keys(found).length) return;
    setPending(true);
    try {
      const vars = { startOdometerKm: s, stopOdometerKm: e, distanceKm: numberOrNull(shownDistance) };
      if (log) await run(UPDATE_DISTANCE_LOG, { id: log.id, ...vars }, { previous: log });
      else await run(CREATE_DISTANCE_LOG, { vehicleId, logDate: date, ...vars });
      await refresh();
      toast.success(tc("saved"));
      onClose();
    } catch (err) {
      failInto(err, setErrors, { logDate: "date", startOdometerKm: "start", stopOdometerKm: "stop", distanceKm: "distance" });
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={log ? t("editTitle") : t("add")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? tc("saving") : tc("save")}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field id="d-vehicle" label={`${t("vehicle")} *`} error={errors.vehicleId} hint={log ? t("fixedOnEdit") : undefined}>
          <Select
            id="d-vehicle"
            value={vehicleId}
            disabled={Boolean(log)}
            onChange={(e) => {
              setVehicleId(e.target.value);
              const v = lookups.vehicleById.get(e.target.value);
              if (v && !start) setStart(numText(v.odometerKm));
            }}
          >
            <option value="">{tc("choose")}</option>
            {lookups.vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {lookups.vehicleLabel(v.id)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="d-date" label={`${t("date")} *`} error={errors.date}>
          <Input id="d-date" type="date" value={date} disabled={Boolean(log)} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="d-start" label={t("start")} error={errors.start}>
            <Input id="d-start" type="number" step="any" inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field id="d-stop" label={t("stop")} error={errors.stop}>
            <Input id="d-stop" type="number" step="any" inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} />
          </Field>
          <Field id="d-distance" label={t("distance")} error={errors.distance} hint={distanceTouched ? undefined : t("autoHint")}>
            <Input
              id="d-distance"
              type="number"
              step="any"
              inputMode="decimal"
              value={shownDistance}
              onChange={(e) => {
                setDistanceTouched(true);
                setDistance(e.target.value);
              }}
            />
          </Field>
        </div>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
