"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/masters/confirm-delete";
import { DataTable } from "@/components/masters/data-table";
import { FormSection, PageHeader } from "@/components/masters/page-header";
import { DayCheckboxes, VehicleChecklist } from "@/components/masters/pickers";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import {
  CREATE_SHIFT,
  CREATE_SHIFT_VEHICLE,
  DELETE_SHIFT,
  DELETE_SHIFT_VEHICLE,
  SHIFTS,
  UPDATE_SHIFT,
  type Shift,
  type ShiftsResult,
} from "@/lib/graphql/vehicle-management";
import {
  apiTime,
  diffMemberships,
  parseWorkingDays,
  serializeWorkingDays,
  timeInputValue,
  type WeekDay,
} from "@/lib/vehicle-management/helpers";
import { useErrorText, useVmLookups, useVmMutations, useVmQuery } from "@/lib/vehicle-management/use-vm";
import { validateShift } from "@/lib/vehicle-management/validation";

/** 8. Working Hours: shifts with their days and assigned vehicles. */
export function WorkingHoursScreen() {
  const t = useTranslations("masters.vm.workingHours");
  const tc = useTranslations("masters.common");
  const td = useTranslations("masters.common.days");
  const lookups = useVmLookups();
  const list = useVmQuery<ShiftsResult>("shifts", SHIFTS);
  const { run, refresh } = useVmMutations();
  const errorText = useErrorText();
  const [editing, setEditing] = useState<Shift | "new" | null>(null);
  const [deleting, setDeleting] = useState<Shift | null>(null);
  const rows = useMemo(
    () => [...(list.data?.shifts.data ?? [])].filter((s) => lookups.inScope(s.companyId)).sort((a, b) => a.name.localeCompare(b.name)),
    [list.data, lookups],
  );

  const days = (json: string | null) => {
    const d = parseWorkingDays(json);
    return d.length === 7 ? t("everyDay") : d.length ? d.map((x) => td(x)).join(", ") : "—";
  };

  return (
    <div className="grid gap-4">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => setEditing("new")} disabled={!lookups.allow("scheduling", "add")}>
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
        searchText={(s) => s.name}
        onEdit={lookups.allow("scheduling", "edit") ? setEditing : undefined}
        onDelete={lookups.allow("scheduling", "delete") ? setDeleting : undefined}
        columns={[
          { key: "account", header: t("account"), cell: (s) => lookups.companyName(s.companyId) },
          { key: "days", header: t("days"), cell: (s) => days(s.workingDays) },
          { key: "from", header: t("from"), numeric: true, cell: (s) => timeInputValue(s.fromTime) },
          { key: "to", header: t("to"), numeric: true, cell: (s) => timeInputValue(s.toTime) },
          { key: "name", header: t("name"), cell: (s) => <span className="font-medium">{s.name}</span> },
          {
            key: "vehicles",
            header: t("vehicles"),
            numeric: true,
            cell: (s) =>
              lookups.vehicles.length > 0 && s.vehicleAssignments.length === lookups.vehicles.length ? t("all") : s.vehicleAssignments.length,
          },
        ]}
      />

      {editing !== null ? <ShiftSheet shift={editing === "new" ? null : editing} shifts={rows} onClose={() => setEditing(null)} /> : null}

      <ConfirmDelete
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting?.name ?? ""}
        onConfirm={async () => {
          if (!deleting) return;
          // Remove the vehicle assignments first so nothing is left pointing at the shift.
          await Promise.all(deleting.vehicleAssignments.map((a) => run(DELETE_SHIFT_VEHICLE, { id: a.id })));
          await run(DELETE_SHIFT, { id: deleting.id });
          await refresh();
          toast.success(tc("deleted"));
        }}
      />
    </div>
  );
}

function ShiftSheet({ shift, shifts, onClose }: { shift: Shift | null; shifts: Shift[]; onClose: () => void }) {
  const t = useTranslations("masters.vm.workingHours");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const { run, refresh, failInto } = useVmMutations();
  const [name, setName] = useState(shift?.name ?? "");
  const [from, setFrom] = useState(timeInputValue(shift?.fromTime) || "08:00");
  const [to, setTo] = useState(timeInputValue(shift?.toTime) || "18:00");
  const [days, setDays] = useState<WeekDay[]>(() => (shift ? parseWorkingDays(shift.workingDays) : ["sun", "mon", "tue", "wed", "thu"]));
  const [vehicles, setVehicles] = useState(() => new Set(shift?.vehicleAssignments.map((a) => a.vehicleId) ?? []));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const save = async () => {
    const found = validateShift({ name, from, to, days }, shifts, shift?.id);
    setErrors(found);
    if (Object.keys(found).length) return;
    setPending(true);
    try {
      const vars = { name: name.trim(), fromTime: apiTime(from), toTime: apiTime(to), workingDays: serializeWorkingDays(days) };
      let id = shift?.id;
      if (id) await run(UPDATE_SHIFT, { id, ...vars });
      else id = (await run<{ createShift: { id: string } }>(CREATE_SHIFT, { companyId: lookups.companyId, ...vars })).createShift.id;
      const diff = diffMemberships(vehicles, shift?.vehicleAssignments ?? []);
      await Promise.all([
        ...diff.add.map((vehicleId) => run(CREATE_SHIFT_VEHICLE, { shiftId: id, vehicleId })),
        ...diff.remove.map((assignmentId) => run(DELETE_SHIFT_VEHICLE, { id: assignmentId })),
      ]);
      await refresh();
      toast.success(tc("saved"));
      onClose();
    } catch (err) {
      failInto(err, setErrors, { fromTime: "from", toTime: "to", workingDays: "days" });
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
      title={shift ? t("editTitle", { name: shift.name }) : t("add")}
      description={t("overnightHint")}
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
        <FormSection title={t("sections.shift")} columns={3}>
          <Field id="sh-name" label={`${t("name")} *`} error={errors.name}>
            <Input id="sh-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field id="sh-from" label={`${t("from")} *`} error={errors.from}>
            <Input id="sh-from" type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field id="sh-to" label={`${t("to")} *`} error={errors.to}>
            <Input id="sh-to" type="time" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <Field id="sh-days" label={`${t("days")} *`} error={errors.days}>
              <DayCheckboxes value={days} onChange={setDays} />
            </Field>
          </div>
        </FormSection>
        <FormSection title={t("assign")} columns={1}>
          <VehicleChecklist vehicles={lookups.vehicles} value={vehicles} onChange={setVehicles} />
        </FormSection>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
