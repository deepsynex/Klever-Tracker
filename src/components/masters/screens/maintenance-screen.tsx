"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/masters/confirm-delete";
import { DataTable } from "@/components/masters/data-table";
import { DriverSelect } from "@/components/masters/driver-select";
import { FormSection, PageHeader, StatusBadge } from "@/components/masters/page-header";
import { SelectWithAdd } from "@/components/masters/pickers";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  CREATE_MAINTENANCE,
  CREATE_MAINTENANCE_ITEM,
  DELETE_MAINTENANCE,
  DELETE_MAINTENANCE_ITEM,
  LOOKUP_OPS,
  MAINTENANCE_PAGE,
  UPDATE_MAINTENANCE,
  UPDATE_MAINTENANCE_ITEM,
  type LookupItem,
  type MaintenancePageResult,
  type MaintenanceRecord,
} from "@/lib/graphql/vehicle-management";
import {
  billTotals,
  companyToday,
  dateInputValue,
  diffRows,
  formatDate,
  lineGross,
  numberOrNull,
  numText,
  roundMoney,
  textOrNull,
  type DiscountType,
} from "@/lib/vehicle-management/helpers";
import { errorLabel, useErrorText, useVmLookups, useVmMutations, useVmQuery } from "@/lib/vehicle-management/use-vm";
import { validateLookupName, validateMaintenance } from "@/lib/vehicle-management/validation";

export const MAINTENANCE_STATUSES = ["scheduled", "in_progress", "completed"] as const;

/** 4. Maintenance: garage visits with their bill's line items. */
export function MaintenanceScreen() {
  const t = useTranslations("masters.vm.maintenance");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const page = useVmQuery<MaintenancePageResult>("maintenance", MAINTENANCE_PAGE);
  const { run, refresh } = useVmMutations();
  const errorText = useErrorText();
  const [editing, setEditing] = useState<MaintenanceRecord | "new" | null>(null);
  const [deleting, setDeleting] = useState<MaintenanceRecord | null>(null);
  const [filters, setFilters] = useState({ from: "", to: "", garage: "", serviceTypeId: "", vehicleId: "" });

  // The chosen company's types for the dropdowns (labels below resolve across all companies).
  const scopedMaintenanceTypes = (page.data?.maintenanceTypes.data ?? []).filter((x) => lookups.inScope(x.companyId));
  const scopedServiceTypes = (page.data?.serviceTypes.data ?? []).filter((x) => lookups.inScope(x.companyId));
  const mTypes = useMemo(() => new Map((page.data?.maintenanceTypes.data ?? []).map((m) => [m.id, m.name])), [page.data]);
  const sTypes = useMemo(() => new Map((page.data?.serviceTypes.data ?? []).map((s) => [s.id, s.name])), [page.data]);
  const garages = useMemo(
    () =>
      [...new Set((page.data?.maintenanceRecords.data ?? []).filter((r) => lookups.inScope(r.companyId)).map((r) => r.garageName).filter(Boolean) as string[])].sort(),
    [page.data, lookups],
  );

  const rows = useMemo(() => {
    const f = filters;
    return [...(page.data?.maintenanceRecords.data ?? [])]
      .filter((r) => {
        if (!lookups.inScope(r.companyId)) return false;
        const day = dateInputValue(r.serviceDate);
        if (f.from && (!day || day < f.from)) return false;
        if (f.to && (!day || day > f.to)) return false;
        if (f.garage && r.garageName !== f.garage) return false;
        if (f.serviceTypeId && r.serviceTypeId !== f.serviceTypeId) return false;
        if (f.vehicleId && r.vehicleId !== f.vehicleId) return false;
        return true;
      })
      .sort((a, b) => (b.serviceDate ?? "").localeCompare(a.serviceDate ?? ""));
  }, [page.data, filters, lookups]);
  const filtered = Object.values(filters).some(Boolean);
  const total = roundMoney(rows.reduce((sum, r) => sum + (r.total ?? 0), 0));

  return (
    <div className="grid gap-4">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => setEditing("new")} disabled={!lookups.allow("maintenance", "add") || lookups.vehicles.length === 0}>
            <Plus />
            {t("add")}
          </Button>
        }
      />

      <div className="grid gap-3 rounded-card border border-border bg-surface p-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field id="mf-from" label={t("filters.from")}>
          <Input id="mf-from" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        </Field>
        <Field id="mf-to" label={t("filters.to")}>
          <Input id="mf-to" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        </Field>
        <Field id="mf-garage" label={t("cols.garage")}>
          <Select id="mf-garage" value={filters.garage} onChange={(e) => setFilters({ ...filters, garage: e.target.value })}>
            <option value="">{tc("all")}</option>
            {garages.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="mf-service" label={t("cols.serviceType")}>
          <Select id="mf-service" value={filters.serviceTypeId} onChange={(e) => setFilters({ ...filters, serviceTypeId: e.target.value })}>
            <option value="">{tc("all")}</option>
            {scopedServiceTypes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="mf-vehicle" label={t("cols.vehicle")}>
          <Select id="mf-vehicle" value={filters.vehicleId} onChange={(e) => setFilters({ ...filters, vehicleId: e.target.value })}>
            <option value="">{tc("all")}</option>
            {lookups.vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {lookups.vehicleLabel(v.id)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end">
          <Button variant="ghost" size="sm" disabled={!filtered} onClick={() => setFilters({ from: "", to: "", garage: "", serviceTypeId: "", vehicleId: "" })}>
            {tc("clearFilters")}
          </Button>
        </div>
      </div>

      <DataTable
        caption={t("title")}
        rows={rows}
        loading={page.isPending}
        error={page.error ? errorText(page.error) : null}
        emptyText={lookups.vehicles.length === 0 ? t("needVehicles") : t("empty")}
        searchText={(r) => [lookups.vehicleLabel(r.vehicleId), lookups.driverName(r.driverId), r.garageName, r.billNumber].join(" ")}
        toolbar={<span className="text-xs text-muted-foreground">{t("totalShown", { total: total.toFixed(2) })}</span>}
        onEdit={lookups.allow("maintenance", "edit") ? setEditing : undefined}
        onDelete={lookups.allow("maintenance", "delete") ? setDeleting : undefined}
        columns={[
          { key: "vehicle", header: t("cols.vehicle"), cell: (r) => <span dir="ltr">{lookups.vehicleLabel(r.vehicleId)}</span> },
          { key: "driver", header: t("cols.driver"), cell: (r) => lookups.driverName(r.driverId) },
          { key: "odo", header: t("cols.odometer"), numeric: true, cell: (r) => r.odometerKm ?? "—" },
          { key: "garage", header: t("cols.garage"), cell: (r) => r.garageName ?? "—" },
          { key: "date", header: t("cols.serviceDate"), cell: (r) => formatDate(r.serviceDate) },
          { key: "service", header: t("cols.serviceType"), cell: (r) => (r.serviceTypeId ? (sTypes.get(r.serviceTypeId) ?? "—") : "—") },
          { key: "mtype", header: t("cols.maintenanceType"), cell: (r) => (r.maintenanceTypeId ? (mTypes.get(r.maintenanceTypeId) ?? "—") : "—") },
          { key: "amount", header: t("cols.amount"), numeric: true, cell: (r) => (r.total != null ? r.total.toFixed(2) : "—") },
          {
            key: "status",
            header: tc("status"),
            cell: (r) => (
              <StatusBadge tone={r.status === "completed" ? "ok" : r.status === "in_progress" ? "info" : "warn"}>{t(`statuses.${r.status}`)}</StatusBadge>
            ),
          },
        ]}
      />

      {editing !== null && page.data ? (
        <MaintenanceSheet
          record={editing === "new" ? null : editing}
          maintenanceTypes={scopedMaintenanceTypes}
          serviceTypes={scopedServiceTypes}
          garages={garages}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <ConfirmDelete
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting ? `${lookups.vehicleLabel(deleting.vehicleId)} · ${formatDate(deleting.serviceDate)}` : ""}
        onConfirm={async () => {
          if (!deleting) return;
          await run(DELETE_MAINTENANCE, { id: deleting.id });
          await refresh();
          toast.success(tc("deleted"));
        }}
      />
    </div>
  );
}

type ItemDraft = { id?: string; itemName: string; quantity: string; unitPrice: string; discountType: DiscountType; discount: string };

function itemFromRecord(i: MaintenanceRecord["items"][number]): ItemDraft {
  // Only the gross price is stored; show any difference from qty × price as a flat discount.
  const base = (i.quantity ?? 0) * (i.unitPrice ?? 0);
  const discount = i.grossPrice != null ? roundMoney(base - i.grossPrice) : 0;
  return {
    id: i.id,
    itemName: i.itemName,
    quantity: numText(i.quantity),
    unitPrice: numText(i.unitPrice),
    discountType: "flat",
    discount: discount > 0 ? String(discount) : "",
  };
}

function MaintenanceSheet({
  record,
  maintenanceTypes,
  serviceTypes,
  garages,
  onClose,
}: {
  record: MaintenanceRecord | null;
  maintenanceTypes: LookupItem[];
  serviceTypes: LookupItem[];
  garages: string[];
  onClose: () => void;
}) {
  const t = useTranslations("masters.vm.maintenance");
  const tc = useTranslations("masters.common");
  const tv = useTranslations("validation");
  const lookups = useVmLookups();
  const { run, refresh, failInto } = useVmMutations();
  const [f, setF] = useState(() => ({
    vehicleId: record?.vehicleId ?? "",
    driverId: record?.driverId ?? "",
    odometerKm: numText(record?.odometerKm),
    maintenanceTypeId: record?.maintenanceTypeId ?? "",
    serviceTypeId: record?.serviceTypeId ?? "",
    serviceDate: dateInputValue(record?.serviceDate) || companyToday(),
    garageName: record?.garageName ?? "",
    garageAddress: record?.garageAddress ?? "",
    billNumber: record?.billNumber ?? "",
    extraWorkDone: record?.extraWorkDone ?? "",
    status: record?.status ?? "completed",
    discountType: (record?.discountPercent != null ? "percent" : "flat") as DiscountType,
    discount: record?.discountPercent != null ? numText(record.discountPercent) : numText(record?.discountAmount),
  }));
  const [items, setItems] = useState<ItemDraft[]>(() => (record?.items ?? []).map(itemFromRecord));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const set = (key: keyof typeof f, value: string) => setF((cur) => ({ ...cur, [key]: value }));

  const grosses = items.map((i) => lineGross(numberOrNull(i.quantity), numberOrNull(i.unitPrice), i.discountType, numberOrNull(i.discount)));
  const totals = billTotals(grosses, f.discountType, numberOrNull(f.discount));

  const addType = (kind: "maintenanceType" | "serviceType") => async ({ name }: Record<string, string>) => {
    const res = await run<Record<string, { id: string }>>(LOOKUP_OPS[kind].create, { companyId: lookups.companyId, name, status: "active" });
    await refresh();
    return res[LOOKUP_OPS[kind].createField].id;
  };

  const save = async () => {
    const found = validateMaintenance(f, items);
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error(tc("fixErrors"));
      return;
    }
    setPending(true);
    try {
      const vars = {
        driverId: f.driverId || null,
        odometerKm: numberOrNull(f.odometerKm),
        maintenanceTypeId: f.maintenanceTypeId || null,
        serviceTypeId: f.serviceTypeId || null,
        serviceDate: textOrNull(f.serviceDate),
        garageName: textOrNull(f.garageName),
        garageAddress: textOrNull(f.garageAddress),
        billNumber: textOrNull(f.billNumber),
        extraWorkDone: textOrNull(f.extraWorkDone),
        discountPercent: f.discountType === "percent" ? numberOrNull(f.discount) : null,
        discountAmount: totals.discountAmount,
        subtotal: totals.subtotal,
        total: totals.total,
        status: f.status,
      };
      let recordId = record?.id;
      if (recordId) await run(UPDATE_MAINTENANCE, { id: recordId, ...vars }, { previous: record });
      else {
        const res = await run<{ createMaintenanceRecord: { id: string } }>(CREATE_MAINTENANCE, {
          companyId: lookups.companyId,
          vehicleId: f.vehicleId,
          ...vars,
        });
        recordId = res.createMaintenanceRecord.id;
      }

      const lines = items.map((i, n) => ({
        id: i.id,
        itemName: i.itemName.trim(),
        quantity: numberOrNull(i.quantity) ?? 1,
        unitPrice: numberOrNull(i.unitPrice),
        grossPrice: grosses[n],
      }));
      const diff = diffRows(lines, (record?.items ?? []).map((i) => i.id));
      await Promise.all([
        ...diff.create.map((line) => run(CREATE_MAINTENANCE_ITEM, { maintenanceRecordId: recordId, ...line })),
        ...diff.update.map((line) => run(UPDATE_MAINTENANCE_ITEM, line, { previous: record?.items.find((i) => i.id === line.id) })),
        ...diff.remove.map((id) => run(DELETE_MAINTENANCE_ITEM, { id })),
      ]);
      await refresh();
      toast.success(tc("saved"));
      onClose();
    } catch (err) {
      failInto(err, setErrors, { discountPercent: "discount", discountAmount: "discount", subtotal: "discount", total: "discount" });
      await refresh();
    } finally {
      setPending(false);
    }
  };

  const typeOptions = (list: LookupItem[], current: string) =>
    list.filter((x) => x.status === "active" || x.id === current).map((x) => ({ id: x.id, label: x.name }));

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      size="xl"
      title={record ? t("editTitle") : t("add")}
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
        <FormSection title={t("sections.visit")} columns={3}>
          <Field id="m-vehicle" label={`${t("cols.vehicle")} *`} error={errors.vehicleId} hint={record ? t("vehicleFixed") : undefined}>
            <Select
              id="m-vehicle"
              value={f.vehicleId}
              disabled={Boolean(record)}
              onChange={(e) => {
                const v = lookups.vehicleById.get(e.target.value);
                setF((cur) => ({
                  ...cur,
                  vehicleId: e.target.value,
                  driverId: cur.driverId || v?.primaryDriverId || "",
                  odometerKm: cur.odometerKm || numText(v?.odometerKm),
                }));
              }}
              aria-invalid={errors.vehicleId ? true : undefined}
            >
              <option value="">{tc("choose")}</option>
              {lookups.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {lookups.vehicleLabel(v.id)}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="m-driver" label={t("cols.driver")}>
            <DriverSelect id="m-driver" value={f.driverId} onChange={(v) => set("driverId", v)} />
          </Field>
          <Field id="m-odo" label={t("cols.odometer")} error={errors.odometerKm}>
            <Input id="m-odo" type="number" step="any" inputMode="decimal" value={f.odometerKm} onChange={(e) => set("odometerKm", e.target.value)} />
          </Field>
          <Field id="m-mtype" label={t("cols.maintenanceType")}>
            <SelectWithAdd
              id="m-mtype"
              value={f.maintenanceTypeId}
              onChange={(v) => set("maintenanceTypeId", v)}
              placeholder={tc("none")}
              options={typeOptions(maintenanceTypes, f.maintenanceTypeId)}
              addLabel={t("addMaintenanceType")}
              canAdd={lookups.allow("maintenance", "add")}
              onCreate={addType("maintenanceType")}
              validate={({ name }) => validateLookupName(name, maintenanceTypes)}
            />
          </Field>
          <Field id="m-stype" label={t("cols.serviceType")}>
            <SelectWithAdd
              id="m-stype"
              value={f.serviceTypeId}
              onChange={(v) => set("serviceTypeId", v)}
              placeholder={tc("none")}
              options={typeOptions(serviceTypes, f.serviceTypeId)}
              addLabel={t("addServiceType")}
              canAdd={lookups.allow("maintenance", "add")}
              onCreate={addType("serviceType")}
              validate={({ name }) => validateLookupName(name, serviceTypes)}
            />
          </Field>
          <Field id="m-date" label={t("cols.serviceDate")}>
            <Input id="m-date" type="date" value={f.serviceDate} onChange={(e) => set("serviceDate", e.target.value)} />
          </Field>
          <Field id="m-garage" label={t("cols.garage")}>
            <Input id="m-garage" list="m-garages" value={f.garageName} onChange={(e) => set("garageName", e.target.value)} />
            <datalist id="m-garages">
              {garages.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </Field>
          <div className="sm:col-span-2">
            <Field id="m-address" label={t("cols.garageAddress")}>
              <Input id="m-address" value={f.garageAddress} onChange={(e) => set("garageAddress", e.target.value)} />
            </Field>
          </div>
          <Field id="m-bill" label={t("f.billNo")}>
            <Input id="m-bill" dir="ltr" value={f.billNumber} onChange={(e) => set("billNumber", e.target.value)} />
          </Field>
          <Field id="m-status" label={tc("status")}>
            <Select id="m-status" value={f.status} onChange={(e) => set("status", e.target.value)}>
              {MAINTENANCE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`statuses.${s}`)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <Field id="m-extra" label={t("f.extraWork")}>
              <Textarea id="m-extra" rows={2} value={f.extraWorkDone} onChange={(e) => set("extraWorkDone", e.target.value)} />
            </Field>
          </div>
        </FormSection>

        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-semibold">{t("sections.items")}</legend>
          <div className="overflow-x-auto rounded-ctl border border-border">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-b border-border bg-surface-2/60 text-xs text-muted-foreground">
                  <th className="px-2 py-2 text-start font-semibold">{t("items.item")} *</th>
                  <th className="w-20 px-2 py-2 text-start font-semibold">{t("items.qty")}</th>
                  <th className="w-28 px-2 py-2 text-start font-semibold">{t("items.price")}</th>
                  <th className="w-24 px-2 py-2 text-start font-semibold">{t("items.discountType")}</th>
                  <th className="w-24 px-2 py-2 text-start font-semibold">{t("items.discount")}</th>
                  <th className="w-28 px-2 py-2 text-end font-semibold">{t("items.gross")}</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-4 text-center text-muted-foreground">
                      {t("items.empty")}
                    </td>
                  </tr>
                ) : (
                  items.map((item, n) => {
                    const update = (patch: Partial<ItemDraft>) => setItems((all) => all.map((x, i) => (i === n ? { ...x, ...patch } : x)));
                    return (
                      <tr key={item.id ?? `new-${n}`} className="border-b border-border last:border-0">
                        <td className="px-2 py-1.5 align-top">
                          <Input
                            aria-label={t("items.item")}
                            value={item.itemName}
                            onChange={(e) => update({ itemName: e.target.value })}
                            aria-invalid={errors[`item-${n}-name`] ? true : undefined}
                            className="h-8"
                          />
                          <CellError code={errors[`item-${n}-name`]} />
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <Input aria-label={t("items.qty")} type="number" step="any" value={item.quantity} onChange={(e) => update({ quantity: e.target.value })} aria-invalid={errors[`item-${n}-qty`] ? true : undefined} className="h-8" />
                          <CellError code={errors[`item-${n}-qty`]} />
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <Input aria-label={t("items.price")} type="number" step="any" value={item.unitPrice} onChange={(e) => update({ unitPrice: e.target.value })} aria-invalid={errors[`item-${n}-price`] ? true : undefined} className="h-8" />
                          <CellError code={errors[`item-${n}-price`]} />
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <Select aria-label={t("items.discountType")} value={item.discountType} onChange={(e) => update({ discountType: e.target.value as DiscountType })} className="h-8">
                            <option value="flat">{t("discount.flat")}</option>
                            <option value="percent">{t("discount.percent")}</option>
                          </Select>
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <Input aria-label={t("items.discount")} type="number" step="any" value={item.discount} onChange={(e) => update({ discount: e.target.value })} aria-invalid={errors[`item-${n}-discount`] ? true : undefined} className="h-8" />
                          <CellError code={errors[`item-${n}-discount`]} />
                        </td>
                        <td className="px-2 py-1.5 text-end font-mono tabular-nums">{grosses[n].toFixed(2)}</td>
                        <td className="px-1 py-1.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 hover:text-destructive"
                            aria-label={tc("remove")}
                            onClick={() => setItems((all) => all.filter((_, i) => i !== n))}
                          >
                            <Trash2 />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setItems((all) => [...all, { itemName: "", quantity: "1", unitPrice: "", discountType: "flat", discount: "" }])}
            >
              <Plus />
              {t("items.add")}
            </Button>
          </div>
        </fieldset>

        <div className="ms-auto grid w-full max-w-sm gap-2 rounded-ctl border border-border p-3 text-[13px]">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("bill.subtotal")}</span>
            <span className="font-mono tabular-nums">{totals.subtotal.toFixed(2)}</span>
          </div>
          <div className="grid grid-cols-[1fr_7rem_6rem] items-center gap-2">
            <span className="text-muted-foreground">{t("bill.discount")}</span>
            <Select aria-label={t("items.discountType")} value={f.discountType} onChange={(e) => set("discountType", e.target.value)} className="h-8">
              <option value="flat">{t("discount.flat")}</option>
              <option value="percent">{t("discount.percent")}</option>
            </Select>
            <Input
              aria-label={t("bill.discount")}
              type="number"
              step="any"
              value={f.discount}
              onChange={(e) => set("discount", e.target.value)}
              aria-invalid={errors.discount ? true : undefined}
              className="h-8"
            />
            {errors.discount ? (
              <p className="col-span-3 text-end text-xs text-destructive">{errorLabel(tv, errors.discount)}</p>
            ) : null}
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-sm font-semibold">
            <span>{t("bill.total")}</span>
            <span className="font-mono tabular-nums">{totals.total.toFixed(2)}</span>
          </div>
        </div>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}

/** Validation message under a table cell input. */
function CellError({ code }: { code?: string }) {
  const tv = useTranslations("validation");
  return code ? <p className="mt-1 text-xs leading-snug text-destructive">{errorLabel(tv, code)}</p> : null;
}
