"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/masters/confirm-delete";
import { DataTable } from "@/components/masters/data-table";
import { FormSection, PageHeader } from "@/components/masters/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import {
  CREATE_FUEL_CALIBRATION,
  CREATE_FUEL_POINT,
  DELETE_FUEL_CALIBRATION,
  DELETE_FUEL_POINT,
  FUEL_CALIBRATIONS,
  UPDATE_FUEL_CALIBRATION,
  UPDATE_FUEL_POINT,
  type FuelCalibration,
  type FuelCalibrationsResult,
} from "@/lib/graphql/vehicle-management";
import { diffRows, numberOrNull, numText } from "@/lib/vehicle-management/helpers";
import { errorLabel, useErrorText, useVmLookups, useVmMutations, useVmQuery } from "@/lib/vehicle-management/use-vm";
import { validateCalibration } from "@/lib/vehicle-management/validation";

/** 11. Fuel Calibration: a tank's voltage → litres lookup table. */
export function FuelCalibrationScreen() {
  const t = useTranslations("masters.vm.fuelCalibration");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const list = useVmQuery<FuelCalibrationsResult>("fuelCalibrations", FUEL_CALIBRATIONS);
  const { run, refresh } = useVmMutations();
  const errorText = useErrorText();
  const [editing, setEditing] = useState<FuelCalibration | "new" | null>(null);
  const [deleting, setDeleting] = useState<FuelCalibration | null>(null);
  const rows = useMemo(
    () => [...(list.data?.fuelCalibrations.data ?? [])].filter((c) => lookups.inScope(c.companyId)).sort((a, b) => a.name.localeCompare(b.name)),
    [list.data, lookups],
  );

  return (
    <div className="grid gap-4">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => setEditing("new")} disabled={!lookups.allow("fuel", "add")}>
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
        emptyText={t("empty")}
        searchText={(c) => c.name}
        onEdit={lookups.allow("fuel", "edit") ? setEditing : undefined}
        onDelete={lookups.allow("fuel", "delete") ? setDeleting : undefined}
        columns={[
          { key: "name", header: t("name"), cell: (c) => <span className="font-medium">{c.name}</span> },
          { key: "capacity", header: t("capacity"), numeric: true, cell: (c) => c.tankCapacityLitres ?? "—" },
          { key: "min", header: t("minVoltage"), numeric: true, cell: (c) => c.minVoltage ?? "—" },
          { key: "max", header: t("maxVoltage"), numeric: true, cell: (c) => c.maxVoltage ?? "—" },
          { key: "points", header: t("points"), numeric: true, cell: (c) => c.points.length },
        ]}
      />

      {editing !== null ? <CalibrationSheet calibration={editing === "new" ? null : editing} calibrations={rows} onClose={() => setEditing(null)} /> : null}

      <ConfirmDelete
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting?.name ?? ""}
        failHint={t("deleteFail")}
        onConfirm={async () => {
          if (!deleting) return;
          await Promise.all(deleting.points.map((p) => run(DELETE_FUEL_POINT, { id: p.id })));
          await run(DELETE_FUEL_CALIBRATION, { id: deleting.id });
          await refresh();
          toast.success(tc("deleted"));
        }}
      />
    </div>
  );
}

type PointDraft = { id?: string; litres: string; voltage: string };

function CalibrationSheet({
  calibration,
  calibrations,
  onClose,
}: {
  calibration: FuelCalibration | null;
  calibrations: FuelCalibration[];
  onClose: () => void;
}) {
  const t = useTranslations("masters.vm.fuelCalibration");
  const tc = useTranslations("masters.common");
  const tv = useTranslations("validation");
  const lookups = useVmLookups();
  const { run, refresh, failInto } = useVmMutations();
  const [name, setName] = useState(calibration?.name ?? "");
  const [capacity, setCapacity] = useState(numText(calibration?.tankCapacityLitres));
  const [minV, setMinV] = useState(numText(calibration?.minVoltage));
  const [maxV, setMaxV] = useState(numText(calibration?.maxVoltage));
  const [points, setPoints] = useState<PointDraft[]>(() =>
    [...(calibration?.points ?? [])]
      .sort((a, b) => a.voltage - b.voltage)
      .map((p) => ({ id: p.id, litres: numText(p.litres), voltage: numText(p.voltage) })),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  // Soft checks shown as warnings: points outside the voltage range or above the tank capacity.
  const warnings = useMemo(() => {
    const out: string[] = [];
    const lo = numberOrNull(minV);
    const hi = numberOrNull(maxV);
    const cap = numberOrNull(capacity);
    if (points.some((p) => (lo !== null && (numberOrNull(p.voltage) ?? lo) < lo) || (hi !== null && (numberOrNull(p.voltage) ?? hi) > hi))) {
      out.push(t("warnVoltage"));
    }
    if (cap !== null && points.some((p) => (numberOrNull(p.litres) ?? 0) > cap)) out.push(t("warnCapacity"));
    return out;
  }, [points, minV, maxV, capacity, t]);

  const save = async () => {
    const lo = numberOrNull(minV);
    const hi = numberOrNull(maxV);
    const found = validateCalibration({ name, capacity, minV, maxV }, points, calibrations, calibration?.id);
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error(tc("fixErrors"));
      return;
    }
    setPending(true);
    try {
      const vars = { name: name.trim(), tankCapacityLitres: numberOrNull(capacity), minVoltage: lo, maxVoltage: hi };
      let id = calibration?.id;
      if (id) {
        const saved = calibration && { tankCapacityLitres: calibration.tankCapacityLitres, minVoltage: calibration.minVoltage, maxVoltage: calibration.maxVoltage };
        await run(UPDATE_FUEL_CALIBRATION, { id, ...vars }, { previous: saved });
      }
      else id = (await run<{ createFuelCalibration: { id: string } }>(CREATE_FUEL_CALIBRATION, { companyId: lookups.companyId, ...vars })).createFuelCalibration.id;
      const rows = points.map((p) => ({ id: p.id, voltage: numberOrNull(p.voltage)!, litres: numberOrNull(p.litres)! }));
      const diff = diffRows(rows, (calibration?.points ?? []).map((p) => p.id));
      await Promise.all([
        ...diff.create.map((p) => run(CREATE_FUEL_POINT, { fuelCalibrationId: id, ...p })),
        ...diff.update.map((p) => run(UPDATE_FUEL_POINT, p)),
        ...diff.remove.map((pointId) => run(DELETE_FUEL_POINT, { id: pointId })),
      ]);
      await refresh();
      toast.success(tc("saved"));
      onClose();
    } catch (err) {
      failInto(err, setErrors, { tankCapacityLitres: "capacity", minVoltage: "minV", maxVoltage: "maxV" });
      await refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      title={calibration ? t("editTitle", { name: calibration.name }) : t("add")}
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
        className="grid gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <FormSection title={t("sections.tank")}>
          <div className="sm:col-span-2">
            <Field id="fc-name" label={`${t("name")} *`} error={errors.name}>
              <Input id="fc-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <Field id="fc-capacity" label={t("capacity")} error={errors.capacity}>
            <Input id="fc-capacity" type="number" step="any" inputMode="decimal" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </Field>
          <span className="hidden sm:block" />
          <Field id="fc-min" label={t("minVoltage")} error={errors.minV}>
            <Input id="fc-min" type="number" step="any" inputMode="decimal" value={minV} onChange={(e) => setMinV(e.target.value)} />
          </Field>
          <Field id="fc-max" label={t("maxVoltage")} error={errors.maxV}>
            <Input id="fc-max" type="number" step="any" inputMode="decimal" value={maxV} onChange={(e) => setMaxV(e.target.value)} />
          </Field>
        </FormSection>

        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-semibold">{t("sections.points")}</legend>
          <p className="-mt-2 text-xs text-subtle">{t("pointsHint")}</p>
          {errors.points ? <Alert tone="error">{errorLabel(tv, errors.points)}</Alert> : null}
          {warnings.map((w) => (
            <Alert key={w} tone="warning">
              {w}
            </Alert>
          ))}
          <div className="overflow-hidden rounded-ctl border border-border">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-surface-2/60 text-xs text-muted-foreground">
                  <th className="px-2 py-2 text-start font-semibold">{t("litres")} *</th>
                  <th className="px-2 py-2 text-start font-semibold">{t("voltage")} *</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {points.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-2 py-4 text-center text-muted-foreground">
                      {t("noPoints")}
                    </td>
                  </tr>
                ) : (
                  points.map((p, i) => (
                    <tr key={p.id ?? `new-${i}`} className="border-b border-border last:border-0">
                      <td className="px-2 py-1.5">
                        <Input
                          aria-label={t("litres")}
                          type="number"
                          step="any"
                          value={p.litres}
                          aria-invalid={errors[`l-${i}`] ? true : undefined}
                          onChange={(e) => setPoints((all) => all.map((x, n) => (n === i ? { ...x, litres: e.target.value } : x)))}
                          className="h-8"
                        />
                        {errors[`l-${i}`] ? <p className="mt-1 text-xs text-destructive">{errorLabel(tv, errors[`l-${i}`])}</p> : null}
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          aria-label={t("voltage")}
                          type="number"
                          step="any"
                          value={p.voltage}
                          aria-invalid={errors[`v-${i}`] ? true : undefined}
                          onChange={(e) => setPoints((all) => all.map((x, n) => (n === i ? { ...x, voltage: e.target.value } : x)))}
                          className="h-8"
                        />
                        {errors[`v-${i}`] ? <p className="mt-1 text-xs text-destructive">{errorLabel(tv, errors[`v-${i}`])}</p> : null}
                      </td>
                      <td className="px-1 py-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 hover:text-destructive"
                          aria-label={tc("remove")}
                          onClick={() => setPoints((all) => all.filter((_, n) => n !== i))}
                        >
                          <Trash2 />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div>
            <Button variant="secondary" size="sm" onClick={() => setPoints((all) => [...all, { litres: "", voltage: "" }])}>
              <Plus />
              {t("addPoint")}
            </Button>
          </div>
        </fieldset>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
