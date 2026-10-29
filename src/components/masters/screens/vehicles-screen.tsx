"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ChildRowsEditor, type ChildField } from "@/components/masters/child-rows";
import { ConfirmDelete } from "@/components/masters/confirm-delete";
import { FileUpload } from "@/components/masters/file-upload";
import { DataTable } from "@/components/masters/data-table";
import { DriverSelect } from "@/components/masters/driver-select";
import { FormSection, PageHeader, StatusBadge } from "@/components/masters/page-header";
import { DayCheckboxes, SelectWithAdd } from "@/components/masters/pickers";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  CREATE_DOCUMENT,
  CREATE_FUEL_TANK,
  CREATE_SENSOR,
  CREATE_VEHICLE,
  DELETE_DOCUMENT,
  DELETE_FUEL_TANK,
  DELETE_SENSOR,
  DELETE_VEHICLE,
  LOOKUP_OPS,
  UPDATE_DOCUMENT,
  UPDATE_FUEL_TANK,
  UPDATE_SENSOR,
  UPDATE_VEHICLE,
  VEHICLE_CHILDREN,
  VEHICLE_DOCUMENTABLE_TYPE,
  VEHICLES_PAGE,
  type Vehicle,
  type VehicleChildrenResult,
  type VehiclesPageResult,
} from "@/lib/graphql/vehicle-management";
import { DOCUMENT_TYPES } from "@/lib/vehicle-management/helpers";
import { useErrorText, useVmLookups, useVmMutations, useVmQuery } from "@/lib/vehicle-management/use-vm";
import { validateDocumentRow, validateLookupName, validateSensorRow, validateTankRow } from "@/lib/vehicle-management/validation";
import {
  emptyVehicleForm,
  FUEL_TYPES,
  PAYMENT_TYPES,
  validateVehicleForm,
  vehicleFormToVariables,
  vehicleToForm,
  type VehicleFormValues,
} from "@/lib/vehicle-management/vehicle-form";
import { cn } from "@/lib/utils";

/** 1. Vehicle Details (the reference site's "Assets List"). */
export function VehiclesScreen() {
  const t = useTranslations("masters.vm.vehicles");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const page = useVmQuery<VehiclesPageResult>("vehicles", VEHICLES_PAGE);
  const { run, refresh } = useVmMutations();
  const errorText = useErrorText();
  const [editing, setEditing] = useState<Vehicle | "new" | null>(null);
  const [deleting, setDeleting] = useState<Vehicle | null>(null);

  const vehicles = useMemo(
    () => [...(page.data?.vehicles.data ?? [])].filter((v) => lookups.inScope(v.companyId)).sort((a, b) => a.plateNo.localeCompare(b.plateNo)),
    [page.data, lookups],
  );
  const deviceByVehicle = useMemo(
    () => new Map((page.data?.devices.data ?? []).filter((d) => d.vehicleId).map((d) => [d.vehicleId as string, d])),
    [page.data],
  );
  const simByVehicle = useMemo(
    () => new Map((page.data?.sims.data ?? []).filter((s) => s.vehicleId).map((s) => [s.vehicleId as string, s])),
    [page.data],
  );

  return (
    <div className="grid gap-4">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => setEditing("new")} disabled={!lookups.allow("vehicles", "add")}>
            <Plus />
            {t("add")}
          </Button>
        }
      />
      <DataTable
        caption={t("title")}
        rows={vehicles}
        loading={page.isPending}
        error={page.error ? errorText(page.error) : null}
        emptyText={t("empty")}
        searchText={(v) =>
          [v.plateNo, v.vehicleName, lookups.driverName(v.primaryDriverId), deviceByVehicle.get(v.id)?.imei, simByVehicle.get(v.id)?.simNumber]
            .filter(Boolean)
            .join(" ")
        }
        onEdit={lookups.allow("vehicles", "edit") ? setEditing : undefined}
        onDelete={lookups.allow("vehicles", "delete") ? setDeleting : undefined}
        columns={[
          { key: "plate", header: t("cols.plate"), cell: (v) => <span className="font-semibold" dir="ltr">{v.plateNo}</span> },
          { key: "asset", header: t("cols.asset"), cell: (v) => v.vehicleName ?? "—" },
          { key: "type", header: t("cols.type"), cell: (v) => lookups.typeName(v.vehicleTypeId) },
          { key: "company", header: t("cols.company"), cell: (v) => lookups.companyName(v.companyId) },
          { key: "driver", header: t("cols.driver"), cell: (v) => (v.primaryDriverId ? lookups.driverName(v.primaryDriverId) : "—") },
          { key: "device", header: t("cols.device"), cell: (v) => deviceByVehicle.get(v.id)?.model ?? "—" },
          { key: "imei", header: t("cols.imei"), numeric: true, cell: (v) => deviceByVehicle.get(v.id)?.imei ?? "—" },
          { key: "sim", header: t("cols.sim"), numeric: true, cell: (v) => simByVehicle.get(v.id)?.simNumber ?? simByVehicle.get(v.id)?.iccid ?? "—" },
          { key: "service", header: t("cols.serviceKm"), numeric: true, cell: (v) => v.serviceIntervalKm?.toLocaleString() ?? "—" },
          {
            key: "status",
            header: tc("status"),
            cell: (v) => <StatusBadge tone={v.status === "active" ? "ok" : "muted"}>{tc(`statuses.${v.status}`)}</StatusBadge>,
          },
        ]}
      />

      {editing !== null ? (
        <VehicleSheet vehicle={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      ) : null}

      <ConfirmDelete
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting?.plateNo ?? ""}
        permanent={false}
        onConfirm={async () => {
          if (!deleting) return;
          await run(DELETE_VEHICLE, { id: deleting.id });
          await refresh();
          toast.success(tc("deleted"));
        }}
      />
    </div>
  );
}

type Tab = "details" | "documents" | "sensors" | "tanks";

function VehicleSheet({ vehicle, onClose }: { vehicle: Vehicle | null; onClose: () => void }) {
  const t = useTranslations("masters.vm.vehicles");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const { run, refresh, failInto } = useVmMutations();
  // After the first save of a new vehicle, the panel stays open on that vehicle.
  const [vehicleId, setVehicleId] = useState<string | null>(vehicle?.id ?? null);
  // What's saved right now, so an update only sends null to clear a value that was set.
  const savedRef = useRef<Record<string, unknown> | null>(vehicle ? vehicleFormToVariables(vehicleToForm(vehicle)) : null);
  const [tab, setTab] = useState<Tab>("details");
  const [form, setForm] = useState<VehicleFormValues>(() => (vehicle ? vehicleToForm(vehicle) : emptyVehicleForm()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const set = <K extends keyof VehicleFormValues>(key: K, value: VehicleFormValues[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    const otherPlates = lookups.vehicles.filter((v) => v.id !== vehicleId).map((v) => v.plateNo);
    const found = validateVehicleForm(form, { otherPlates });
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error(tc("fixErrors"));
      return;
    }
    if (!lookups.companyId) return;
    setPending(true);
    try {
      const vars = vehicleFormToVariables(form);
      if (vehicleId) {
        await run(UPDATE_VEHICLE, { id: vehicleId, ...vars }, { previous: savedRef.current });
        savedRef.current = vars;
        toast.success(tc("saved"));
      } else {
        const res = await run<{ createVehicle: { id: string } }>(CREATE_VEHICLE, { companyId: lookups.companyId, ...vars });
        savedRef.current = vars;
        setVehicleId(res.createVehicle.id);
        toast.success(t("createdNext"));
      }
      await refresh();
    } catch (err) {
      failInto(err, setErrors);
    } finally {
      setPending(false);
    }
  };

  const text = (key: keyof VehicleFormValues, label: string, opts: { type?: string; required?: boolean; hint?: ReactNode; dir?: "ltr"; span?: boolean } = {}) => (
    <div className={opts.span ? "sm:col-span-2" : undefined}>
      <Field id={`v-${key}`} label={opts.required ? `${label} *` : label} error={errors[key]} hint={opts.hint}>
        <Input
          id={`v-${key}`}
          type={opts.type ?? "text"}
          step={opts.type === "number" ? "any" : undefined}
          inputMode={opts.type === "number" ? "decimal" : undefined}
          dir={opts.dir}
          value={form[key] as string}
          onChange={(e) => set(key, e.target.value as never)}
          aria-invalid={errors[key] ? true : undefined}
        />
      </Field>
    </div>
  );

  const tabs: Tab[] = ["details", "documents", "sensors", "tanks"];

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      size="xl"
      title={vehicleId ? t("editTitle", { plate: form.plateNo || "…" }) : t("add")}
      description={t("formDescription")}
      footer={
        tab === "details" ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              {vehicleId ? tc("close") : tc("cancel")}
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending ? tc("saving") : tc("save")}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            {tc("close")}
          </Button>
        )
      }
    >
      <div role="tablist" aria-label={t("formTabs")} className="mb-4 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            disabled={k !== "details" && !vehicleId}
            title={k !== "details" && !vehicleId ? t("saveFirst") : undefined}
            onClick={() => setTab(k)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50",
              tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`tabs.${k}`)}
          </button>
        ))}
      </div>

      {tab === "details" ? (
        <form
          className="grid gap-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <FormSection title={t("sections.basic")} columns={3}>
            {text("plateNo", t("f.plateNo"), { required: true, dir: "ltr" })}
            {text("vehicleName", t("f.vehicleName"))}
            <Field id="v-vehicleTypeId" label={`${t("f.vehicleType")} *`} error={errors.vehicleTypeId}>
              <SelectWithAdd
                id="v-vehicleTypeId"
                value={form.vehicleTypeId}
                onChange={(v) => set("vehicleTypeId", v)}
                invalid={Boolean(errors.vehicleTypeId)}
                placeholder={tc("choose")}
                options={lookups.vehicleTypes
                  .filter((ty) => ty.status === "active" || ty.id === form.vehicleTypeId)
                  .map((ty) => ({ id: ty.id, label: ty.name }))}
                addLabel={t("addType")}
                canAdd={lookups.allow("vehicles", "add")}
                validate={({ name }) => validateLookupName(name, lookups.vehicleTypes)}
                onCreate={async ({ name }) => {
                  const res = await run<{ createVehicleType: { id: string } }>(LOOKUP_OPS.vehicleType.create, {
                    companyId: lookups.companyId,
                    name,
                    status: "active",
                  });
                  await refresh();
                  return res.createVehicleType.id;
                }}
              />
            </Field>
            <Field id="v-timezone" label={t("f.timezone")}>
              <Select id="v-timezone" value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>
                <option value="">{tc("none")}</option>
                {timeZones(form.timezone).map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="v-driver" label={t("f.driver")}>
              <DriverSelect id="v-driver" value={form.primaryDriverId} onChange={(v) => set("primaryDriverId", v)} />
            </Field>
            {text("barcode", t("f.barcode"), { dir: "ltr" })}
            {text("brand", t("f.brand"))}
            {text("model", t("f.model"))}
            {text("colour", t("f.colour"))}
            {text("year", t("f.year"), { type: "number" })}
            <div className="sm:col-span-2">
              <Field id="v-photoPath" label={t("f.photo")}>
                <FileUpload id="v-photoPath" purpose="vehicle_photo" value={form.photoPath} onChange={(url) => set("photoPath", url)} />
              </Field>
            </div>
            <Field id="v-status" label={tc("status")}>
              <Select id="v-status" value={form.status} onChange={(e) => set("status", e.target.value)}>
                <option value="active">{tc("statuses.active")}</option>
                <option value="inactive">{tc("statuses.inactive")}</option>
              </Select>
            </Field>
            <div className="sm:col-span-2 lg:col-span-2">
              <Field id="v-comment" label={t("f.comment")}>
                <Textarea id="v-comment" value={form.comment} onChange={(e) => set("comment", e.target.value)} rows={2} />
              </Field>
            </div>
            <div className="flex items-end pb-2">
              <Checkbox label={t("f.canbus")} checked={form.hasCanBus} onChange={(e) => set("hasCanBus", e.target.checked)} />
            </div>
          </FormSection>

          <FormSection title={t("sections.subscription")} columns={3}>
            {text("installDate", t("f.installDate"), { type: "date", required: true })}
            <Field id="v-paymentType" label={`${t("f.paymentType")} *`} error={errors.paymentType}>
              <Select id="v-paymentType" value={form.paymentType} onChange={(e) => set("paymentType", e.target.value)}>
                {PAYMENT_TYPES.map((p) => (
                  <option key={p} value={p}>
                    {t(`payment.${p}`)}
                  </option>
                ))}
              </Select>
            </Field>
            {text("subscriptionExpiresAt", t("f.expiryDate"), { type: "date" })}
            {text("renewedAt", t("f.renewedAt"), { type: "date" })}
          </FormSection>

          <Alert tone="info">{t("complianceNote")}</Alert>

          <FormSection title={t("sections.limits")} columns={3}>
            {text("speedLimitKmh", t("f.speedLimit"), { type: "number", required: true })}
            {text("idleLimitMinutes", t("f.idleLimit"), { type: "number", required: true })}
            <span className="hidden lg:block" />
            {text("trackingHoursFrom", t("f.trackingFrom"), { type: "time" })}
            {text("trackingHoursTo", t("f.trackingTo"), { type: "time" })}
            <div className="sm:col-span-2 lg:col-span-3">
              <Field id="v-days" label={t("f.trackingDays")} hint={t("f.trackingDaysHint")}>
                <DayCheckboxes value={form.workingDays} onChange={(d) => set("workingDays", d)} />
              </Field>
            </div>
          </FormSection>

          <FormSection title={t("sections.service")} columns={3}>
            {text("odometerKm", t("f.odometer"), { type: "number" })}
            {text("lastServiceDate", t("f.lastService"), { type: "date" })}
            {text("lastOilChangeDate", t("f.lastOil"), { type: "date" })}
            {text("lastTyreChangeDate", t("f.lastTyre"), { type: "date" })}
            {text("tyreIntervalKm", t("f.tyreInterval"), { type: "number" })}
            {text("oilIntervalKm", t("f.oilInterval"), { type: "number" })}
            {text("serviceIntervalKm", t("f.serviceInterval"), { type: "number" })}
            {text("machineServiceHours", t("f.machineHours"), { type: "number" })}
          </FormSection>

          <FormSection title={t("sections.finance")} columns={3}>
            {text("purchaseDate", t("f.purchaseDate"), { type: "date" })}
            {text("totalCost", t("f.totalCost"), { type: "number" })}
            {text("downPayment", t("f.downPayment"), { type: "number" })}
            {text("monthlyEmi", t("f.monthlyEmi"), { type: "number" })}
            {text("emiCount", t("f.emiCount"), { type: "number" })}
            {text("emiDueDay", t("f.emiDueDay"), { type: "number", hint: t("f.emiDueDayHint") })}
          </FormSection>

          <FormSection title={t("sections.fuel")} description={t("fuelNote")} columns={3}>
            <Field id="v-fuelType" label={t("f.fuelType")}>
              <Select id="v-fuelType" value={form.fuelType} onChange={(e) => set("fuelType", e.target.value)}>
                <option value="">{tc("none")}</option>
                {FUEL_TYPES.map((f) => (
                  <option key={f} value={f}>
                    {t(`fuel.${f}`)}
                  </option>
                ))}
              </Select>
            </Field>
            {text("fuelConsumptionRate", t("f.mileage"), { type: "number" })}
          </FormSection>
          <button type="submit" hidden />
        </form>
      ) : vehicleId ? (
        <VehicleChildren key={tab} vehicleId={vehicleId} tab={tab} />
      ) : null}
    </Sheet>
  );
}

/** All IANA time zones the browser knows, with the current value kept even if unknown. */
function timeZones(current: string): string[] {
  const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [
    "Asia/Dubai",
  ];
  return current && !all.includes(current) ? [current, ...all] : all;
}

function VehicleChildren({ vehicleId, tab }: { vehicleId: string; tab: Exclude<Tab, "details"> }) {
  const t = useTranslations("masters.vm.vehicles");
  const lookups = useVmLookups();
  const children = useVmQuery<VehicleChildrenResult>("vehicleChildren", VEHICLE_CHILDREN);
  const errorText = useErrorText();

  if (children.isPending) return <p className="text-[13px] text-muted-foreground">{t("loading")}</p>;
  if (children.error) return <Alert tone="error">{errorText(children.error)}</Alert>;
  const data = children.data!;

  if (tab === "documents") {
    const docFields: ChildField[] = [
      {
        key: "type",
        label: t("doc.type"),
        type: "select",
        required: true,
        createOnly: true,
        options: DOCUMENT_TYPES.map((d) => ({ value: d, label: t(`docTypes.${d}`) })),
      },
      { key: "customLabel", label: t("doc.label"), type: "text", placeholder: t("doc.labelPlaceholder") },
      { key: "documentNo", label: t("doc.number"), type: "text" },
      { key: "issuedAt", label: t("doc.issuedAt"), type: "date" },
      { key: "expiresAt", label: t("doc.expiresAt"), type: "date" },
      { key: "reminderDaysBefore", label: t("doc.reminder"), type: "int" },
      { key: "filePath", label: t("doc.file"), type: "file", purpose: "document", className: "sm:col-span-2 lg:col-span-3" },
    ];
    return (
      <ChildRowsEditor
        title={t("tabs.documents")}
        rows={data.documents.data.filter((d) => d.documentableType === VEHICLE_DOCUMENTABLE_TYPE && d.documentableId === vehicleId)}
        fields={docFields}
        newRow={{ type: "insurance" }}
        createVariables={{ companyId: lookups.companyId, documentableType: VEHICLE_DOCUMENTABLE_TYPE, documentableId: vehicleId }}
        ops={{ create: CREATE_DOCUMENT, update: UPDATE_DOCUMENT, remove: DELETE_DOCUMENT }}
        readOnly={!lookups.allow("other", "edit")}
        validate={validateDocumentRow}
        addLabel={t("doc.add")}
        emptyText={t("doc.empty")}
      />
    );
  }

  if (tab === "sensors") {
    const sensorFields: ChildField[] = [
      {
        key: "sensorType",
        label: t("sensor.type"),
        type: "select",
        required: true,
        createOnly: true,
        options: ["analog_input", "digital_input", "temperature", "ble_temperature_humidity"].map((s) => ({
          value: s,
          label: t(`sensorTypes.${s}`),
        })),
      },
      { key: "label", label: t("sensor.label"), type: "text" },
      { key: "ioIndex", label: t("sensor.ioIndex"), type: "int" },
      { key: "maxVoltage", label: t("sensor.maxVoltage"), type: "number", visible: (d) => (d.sensorType ?? "") === "analog_input" },
      { key: "lowLimit", label: t("sensor.lowLimit"), type: "number", visible: (d) => (d.sensorType ?? "").includes("temperature") },
      { key: "highLimit", label: t("sensor.highLimit"), type: "number", visible: (d) => (d.sensorType ?? "").includes("temperature") },
      { key: "sortOrder", label: t("sensor.sortOrder"), type: "int", omitIfEmpty: true },
    ];
    const sensors = data.vehicleSensors.data.filter((s) => s.vehicleId === vehicleId).sort((a, b) => a.sortOrder - b.sortOrder);
    return (
      <ChildRowsEditor
        title={t("tabs.sensors")}
        rows={sensors}
        fields={sensorFields}
        newRow={{ sensorType: "analog_input", sortOrder: String((sensors.at(-1)?.sortOrder ?? 0) + 1) }}
        createVariables={{ vehicleId }}
        ops={{ create: CREATE_SENSOR, update: UPDATE_SENSOR, remove: DELETE_SENSOR }}
        readOnly={!lookups.allow("other", "edit")}
        validate={validateSensorRow}
        addLabel={t("sensor.add")}
        emptyText={t("sensor.empty")}
      />
    );
  }

  const tanks = data.vehicleFuelTanks.data.filter((f) => f.vehicleId === vehicleId).sort((a, b) => a.tankIndex - b.tankIndex);
  const tankFields: ChildField[] = [
    { key: "tankIndex", label: t("tank.index"), type: "int", required: true, omitIfEmpty: true },
    { key: "shape", label: t("tank.shape"), type: "text" },
    { key: "volumeLitres", label: t("tank.volume"), type: "number" },
    {
      key: "fuelCalibrationId",
      label: t("tank.calibration"),
      type: "select",
      // Only this vehicle's company's calibrations (a platform account sees every company's).
      options: data.fuelCalibrations.data
        .filter((c) => c.companyId === lookups.vehicleCompanyId(vehicleId))
        .map((c) => ({ value: c.id, label: c.name })),
    },
    { key: "minimumRefillLitres", label: t("tank.minRefill"), type: "number" },
  ];
  return (
    <ChildRowsEditor
      title={t("tabs.tanks")}
      rows={tanks}
      fields={tankFields}
      newRow={{ tankIndex: String((tanks.at(-1)?.tankIndex ?? 0) + 1) }}
      createVariables={{ vehicleId }}
      ops={{ create: CREATE_FUEL_TANK, update: UPDATE_FUEL_TANK, remove: DELETE_FUEL_TANK }}
      readOnly={!lookups.allow("fuel", "edit")}
      validate={(values, rowId) => validateTankRow(values, tanks.filter((x) => x.id !== rowId).map((x) => x.tankIndex))}
      addLabel={t("tank.add")}
      emptyText={t("tank.empty")}
    />
  );
}
