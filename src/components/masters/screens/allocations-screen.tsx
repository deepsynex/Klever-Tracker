"use client";

import { Plus, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/masters/confirm-delete";
import { DataTable } from "@/components/masters/data-table";
import { DriverSelect } from "@/components/masters/driver-select";
import { FormSection, PageHeader, StatusBadge } from "@/components/masters/page-header";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  ALLOCATIONS,
  CREATE_ALLOCATION,
  DELETE_ALLOCATION,
  UPDATE_ALLOCATION,
  type AllocationsResult,
  type VehicleAllocation,
} from "@/lib/graphql/vehicle-management";
import {
  companyDateTimeParts,
  companyNowTime,
  companyPartsToUtc,
  companyToday,
  daysUsed,
  formatDateTime,
  kmDriven,
  numberOrNull,
  numText,
  parseApiDateTime,
  returnChargesTotal,
  textOrNull,
} from "@/lib/vehicle-management/helpers";
import { useErrorText, useVmLookups, useVmMutations, useVmQuery } from "@/lib/vehicle-management/use-vm";
import { validateAllocation, validateReturn } from "@/lib/vehicle-management/validation";
import { cn } from "@/lib/utils";

type Filter = "all" | "out" | "returned";

/** Whether an allocation is still out and past its due time. */
function isOverdue(a: VehicleAllocation, now = new Date()) {
  const due = parseApiDateTime(a.dueAt);
  return !a.returnedAt && a.status !== "returned" && due !== null && due.getTime() < now.getTime();
}

/** 2 & 3. Allocate Vehicle / Return Assets: one VehicleAllocation row per checkout. */
export function AllocationsScreen() {
  const t = useTranslations("masters.vm.allocations");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const list = useVmQuery<AllocationsResult>("allocations", ALLOCATIONS);
  const { run, refresh } = useVmMutations();
  const errorText = useErrorText();
  const [filter, setFilter] = useState<Filter>("all");
  const [sheet, setSheet] = useState<{ mode: "allocate" } | { mode: "return"; row: VehicleAllocation } | null>(null);
  const [deleting, setDeleting] = useState<VehicleAllocation | null>(null);

  // Vehicles that are out right now: allocated and not yet returned.
  const vehiclesOut = useMemo(
    () => new Set((list.data?.vehicleAllocations.data ?? []).filter((a) => !a.returnedAt).map((a) => a.vehicleId)),
    [list.data],
  );
  const rows = useMemo(() => {
    const all = [...(list.data?.vehicleAllocations.data ?? [])]
      .filter((a) => lookups.inScope(lookups.vehicleCompanyId(a.vehicleId)))
      .sort((a, b) => b.allocatedAt.localeCompare(a.allocatedAt));
    if (filter === "out") return all.filter((a) => !a.returnedAt);
    if (filter === "returned") return all.filter((a) => a.returnedAt);
    return all;
  }, [list.data, filter, lookups]);

  return (
    <div className="grid gap-4">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => setSheet({ mode: "allocate" })} disabled={!lookups.allow("other", "add") || lookups.vehicles.length === 0}>
            <Plus />
            {t("allocate")}
          </Button>
        }
      />
      <DataTable
        caption={t("title")}
        rows={rows}
        loading={list.isPending}
        error={list.error ? errorText(list.error) : null}
        emptyText={lookups.vehicles.length === 0 ? t("needVehicles") : t("empty")}
        searchText={(a) => [lookups.vehicleLabel(a.vehicleId), lookups.driverName(a.driverId), a.project].join(" ")}
        toolbar={
          <Select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="h-8 w-auto" aria-label={t("filter")}>
            <option value="all">{t("filters.all")}</option>
            <option value="out">{t("filters.out")}</option>
            <option value="returned">{t("filters.returned")}</option>
          </Select>
        }
        rowActions={(a) =>
          lookups.allow("other", "edit") && !a.returnedAt ? (
            <Button variant="secondary" size="sm" className="h-7" onClick={() => setSheet({ mode: "return", row: a })}>
              <Undo2 className="rtl:-scale-x-100" />
              {t("return")}
            </Button>
          ) : null
        }
        onEdit={lookups.allow("other", "edit") ? (a) => setSheet({ mode: "return", row: a }) : undefined}
        onDelete={lookups.allow("other", "delete") ? setDeleting : undefined}
        columns={[
          { key: "driver", header: t("cols.driver"), cell: (a) => lookups.driverName(a.driverId) },
          { key: "vehicle", header: t("cols.vehicle"), cell: (a) => <span dir="ltr">{lookups.vehicleLabel(a.vehicleId)}</span> },
          { key: "allocated", header: t("cols.allocatedAt"), cell: (a) => formatDateTime(a.allocatedAt) },
          { key: "returned", header: t("cols.returnedAt"), cell: (a) => formatDateTime(a.returnedAt) },
          { key: "days", header: t("cols.daysUsed"), numeric: true, cell: (a) => daysUsed(a.allocatedAt, a.returnedAt) ?? "—" },
          { key: "km", header: t("cols.totalKm"), numeric: true, cell: (a) => kmDriven(a.startOdometerKm, a.returnOdometerKm) ?? "—" },
          { key: "amount", header: t("cols.amount"), numeric: true, cell: (a) => (a.amount != null ? a.amount.toFixed(2) : "—") },
          { key: "project", header: t("cols.project"), cell: (a) => a.project ?? "—" },
          { key: "to", header: t("cols.allocateTo"), cell: (a) => (a.project ? t("to.project") : t("to.driver")) },
          {
            key: "status",
            header: tc("status"),
            cell: (a) =>
              a.returnedAt || a.status === "returned" ? (
                <StatusBadge tone="muted">{t("status.returned")}</StatusBadge>
              ) : isOverdue(a) || a.status === "overdue" ? (
                <StatusBadge tone="bad">{t("status.overdue")}</StatusBadge>
              ) : (
                <StatusBadge tone="info">{t("status.allocated")}</StatusBadge>
              ),
          },
        ]}
      />

      {sheet?.mode === "allocate" ? <AllocateSheet vehiclesOut={vehiclesOut} onClose={() => setSheet(null)} /> : null}
      {sheet?.mode === "return" ? <ReturnSheet row={sheet.row} onClose={() => setSheet(null)} /> : null}

      <ConfirmDelete
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting ? `${lookups.vehicleLabel(deleting.vehicleId)} → ${lookups.driverName(deleting.driverId)}` : ""}
        onConfirm={async () => {
          if (!deleting) return;
          await run(DELETE_ALLOCATION, { id: deleting.id });
          await refresh();
          toast.success(tc("deleted"));
        }}
      />
    </div>
  );
}

function AllocateSheet({ vehiclesOut, onClose }: { vehiclesOut: Set<string>; onClose: () => void }) {
  const t = useTranslations("masters.vm.allocations");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const { run, refresh, failInto } = useVmMutations();
  const [to, setTo] = useState<"driver" | "project">("driver");
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [project, setProject] = useState("");
  const [date, setDate] = useState(companyToday());
  const [time, setTime] = useState(companyNowTime());
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [odometer, setOdometer] = useState("");
  const [condition, setCondition] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const driver = lookups.driverById.get(driverId);

  const save = async () => {
    const start = companyPartsToUtc(date, time);
    const due = companyPartsToUtc(dueDate, dueTime);
    const found = validateAllocation({ vehicleId, driverId, to, project, date, start, due, odometer }, vehiclesOut);
    setErrors(found);
    if (Object.keys(found).length) return;
    setPending(true);
    try {
      await run(CREATE_ALLOCATION, {
        vehicleId,
        driverId,
        project: to === "project" ? textOrNull(project) : null,
        allocatedAt: start,
        dueAt: due,
        vehicleConditionOut: textOrNull(condition),
        startOdometerKm: numberOrNull(odometer),
        status: "allocated",
      });
      await refresh();
      toast.success(t("allocated"));
      onClose();
    } catch (err) {
      failInto(err, setErrors, { allocatedAt: "date", dueAt: "dueDate", startOdometerKm: "odometer" });
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      title={t("allocateTitle")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? tc("saving") : t("allocate")}
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
        <FormSection title={t("sections.who")}>
          <div className="flex gap-4 sm:col-span-2" role="radiogroup" aria-label={t("cols.allocateTo")}>
            {(["driver", "project"] as const).map((k) => (
              <label key={k} className="inline-flex items-center gap-2 text-sm">
                <input type="radio" name="allocate-to" checked={to === k} onChange={() => setTo(k)} className="accent-primary" />
                {t(`to.${k}`)}
              </label>
            ))}
          </div>
          <Field id="al-vehicle" label={`${t("cols.vehicle")} *`} error={errors.vehicleId}>
            <Select
              id="al-vehicle"
              value={vehicleId}
              onChange={(e) => {
                setVehicleId(e.target.value);
                const v = lookups.vehicleById.get(e.target.value);
                if (v) {
                  setOdometer(numText(v.odometerKm));
                  if (!driverId && v.primaryDriverId) setDriverId(v.primaryDriverId);
                }
              }}
              aria-invalid={errors.vehicleId ? true : undefined}
            >
              <option value="">{tc("choose")}</option>
              {lookups.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {vehiclesOut.has(v.id) ? `${lookups.vehicleLabel(v.id)} ${t("outSuffix")}` : lookups.vehicleLabel(v.id)}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="al-driver" label={`${t("cols.driver")} *`} error={errors.driverId}>
            <DriverSelect id="al-driver" value={driverId} onChange={setDriverId} required invalid={Boolean(errors.driverId)} />
          </Field>
          {to === "project" ? (
            <div className="sm:col-span-2">
              <Field id="al-project" label={`${t("cols.project")} *`} error={errors.project}>
                <Input id="al-project" value={project} onChange={(e) => setProject(e.target.value)} />
              </Field>
            </div>
          ) : null}
          {driver ? (
            <dl className="grid grid-cols-3 gap-2 rounded-ctl bg-surface-2 p-3 text-[13px] sm:col-span-2">
              <div>
                <dt className="text-xs text-subtle">{t("driver.licenceNo")}</dt>
                <dd dir="ltr">{driver.licenceNo ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">{t("driver.mobile")}</dt>
                <dd dir="ltr">{driver.mobile}</dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">{t("driver.employeeId")}</dt>
                <dd dir="ltr">{driver.employeeId ?? "—"}</dd>
              </div>
            </dl>
          ) : null}
        </FormSection>

        <FormSection title={t("sections.checkout")}>
          <Field id="al-date" label={`${t("f.allocateDate")} *`} error={errors.date}>
            <Input id="al-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field id="al-time" label={t("f.allocateTime")}>
            <Input id="al-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field id="al-due" label={t("f.dueDate")} error={errors.dueDate}>
            <Input id="al-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field id="al-due-time" label={t("f.dueTime")}>
            <Input id="al-due-time" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
          </Field>
          <Field id="al-odo" label={t("f.currentOdometer")} error={errors.odometer}>
            <Input id="al-odo" type="number" step="any" inputMode="decimal" value={odometer} onChange={(e) => setOdometer(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field id="al-cond" label={t("f.conditionOut")}>
              <Textarea id="al-cond" rows={2} value={condition} onChange={(e) => setCondition(e.target.value)} />
            </Field>
          </div>
        </FormSection>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}

function ReturnSheet({ row, onClose }: { row: VehicleAllocation; onClose: () => void }) {
  const t = useTranslations("masters.vm.allocations");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const { run, refresh, failInto } = useVmMutations();
  const returned = companyDateTimeParts(row.returnedAt);
  const [date, setDate] = useState(returned.date || companyToday());
  const [time, setTime] = useState(returned.time || companyNowTime());
  const [odometer, setOdometer] = useState(numText(row.returnOdometerKm));
  const [condition, setCondition] = useState(row.vehicleConditionIn ?? "");
  const [salik, setSalik] = useState(numText(row.salikUsedAmount));
  const [fines, setFines] = useState(numText(row.trafficFinesAmount));
  const [damage, setDamage] = useState(numText(row.damageChargeAmount));
  const [paymentMode, setPaymentMode] = useState(row.paymentMode ?? "");
  const [amount, setAmount] = useState(numText(row.amount));
  const [amountTouched, setAmountTouched] = useState(row.amount != null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const suggested = returnChargesTotal(numberOrNull(salik), numberOrNull(fines), numberOrNull(damage));
  const shownAmount = amountTouched ? amount : suggested ? String(suggested) : "";
  const returnedAt = companyPartsToUtc(date, time);
  const km = kmDriven(row.startOdometerKm, numberOrNull(odometer));

  const save = async () => {
    const odo = numberOrNull(odometer);
    const found = validateReturn({
      date,
      returnedAt,
      allocatedAt: row.allocatedAt,
      odometer,
      startOdometerKm: row.startOdometerKm,
      charges: { salik, fines, damage, amount: shownAmount },
    });
    setErrors(found);
    if (Object.keys(found).length) return;
    setPending(true);
    try {
      await run(
        UPDATE_ALLOCATION,
        {
        id: row.id,
        returnedAt,
        returnOdometerKm: odo,
        vehicleConditionIn: textOrNull(condition),
        salikUsedAmount: numberOrNull(salik),
        trafficFinesAmount: numberOrNull(fines),
        damageChargeAmount: numberOrNull(damage),
        paymentMode: textOrNull(paymentMode),
        amount: numberOrNull(shownAmount),
        status: "returned",
        },
        { previous: row },
      );
      await refresh();
      toast.success(t("returnedToast"));
      onClose();
    } catch (err) {
      failInto(err, setErrors, {
        returnedAt: "date",
        returnOdometerKm: "odometer",
        salikUsedAmount: "salik",
        trafficFinesAmount: "fines",
        damageChargeAmount: "damage",
      });
    } finally {
      setPending(false);
    }
  };

  const money = (id: string, label: string, value: string, onChange: (v: string) => void) => (
    <Field id={`ret-${id}`} label={label} error={errors[id]}>
      <Input id={`ret-${id}`} type="number" step="any" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      title={row.returnedAt ? t("editReturnTitle") : t("returnTitle")}
      description={`${lookups.vehicleLabel(row.vehicleId)} · ${lookups.driverName(row.driverId)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? tc("saving") : row.returnedAt ? tc("save") : t("return")}
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
        <dl className="grid grid-cols-2 gap-3 rounded-ctl bg-surface-2 p-3 text-[13px] sm:grid-cols-4">
          <Info label={t("cols.allocatedAt")} value={formatDateTime(row.allocatedAt)} />
          <Info label={t("f.initialOdometer")} value={row.startOdometerKm ?? "—"} />
          <Info label={t("cols.allocateTo")} value={row.project ? `${t("to.project")}: ${row.project}` : t("to.driver")} />
          <Info label={t("f.conditionOut")} value={row.vehicleConditionOut ?? "—"} />
        </dl>

        <FormSection title={t("sections.return")}>
          <Field id="ret-date" label={`${t("f.returnDate")} *`} error={errors.date}>
            <Input id="ret-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field id="ret-time" label={t("f.returnTime")}>
            <Input id="ret-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field id="ret-odometer" label={t("f.returnOdometer")} error={errors.odometer}>
            <Input id="ret-odometer" type="number" step="any" inputMode="decimal" value={odometer} onChange={(e) => setOdometer(e.target.value)} />
          </Field>
          <dl className="grid grid-cols-2 gap-2 self-end rounded-ctl border border-dashed border-border p-2 text-[13px]">
            <Info label={t("cols.daysUsed")} value={daysUsed(row.allocatedAt, returnedAt) ?? "—"} />
            <Info label={t("cols.totalKm")} value={km ?? "—"} />
          </dl>
          <div className="sm:col-span-2">
            <Field id="ret-cond" label={t("f.conditionIn")}>
              <Textarea id="ret-cond" rows={2} value={condition} onChange={(e) => setCondition(e.target.value)} />
            </Field>
          </div>
        </FormSection>

        <FormSection title={t("sections.charges")} columns={3}>
          {money("salik", t("f.salik"), salik, setSalik)}
          {money("fines", t("f.trafficFine"), fines, setFines)}
          {money("damage", t("f.damage"), damage, setDamage)}
          <Field id="ret-payment" label={t("f.paymentMode")}>
            <Input id="ret-payment" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} placeholder={t("f.paymentModePlaceholder")} />
          </Field>
          <div className="sm:col-span-2">
            <Field id="ret-amount" label={t("f.totalAmount")} error={errors.amount} hint={amountTouched ? undefined : t("f.totalHint")}>
              <Input
                id="ret-amount"
                type="number"
                step="any"
                inputMode="decimal"
                value={shownAmount}
                className={cn(!amountTouched && "text-muted-foreground")}
                onChange={(e) => {
                  setAmountTouched(true);
                  setAmount(e.target.value);
                }}
              />
            </Field>
          </div>
        </FormSection>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}
