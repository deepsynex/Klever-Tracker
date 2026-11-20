"use client";

import { ArrowRight, CircleCheck, Plus, RotateCcw, Route, Settings2, Truck, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/masters/confirm-delete";
import { DataTable } from "@/components/masters/data-table";
import { isDirty, useDiscardGuard } from "@/components/masters/discard-guard";
import { FileUpload } from "@/components/masters/file-upload";
import { FilterSelect, FormSection, KpiCards, PageHeader, StatusBadge } from "@/components/masters/page-header";
import { SelectWithAdd } from "@/components/masters/pickers";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { useRouter } from "@/i18n/navigation";
import { useQuery } from "@tanstack/react-query";
import { gqlRequest } from "@/lib/graphql/client";
import {
  CREATE_CUSTOMER_VEHICLE,
  SET_VEHICLE_AXLE_TYRE_SIZES,
  SET_VEHICLE_TYRE_POSITION_PRODUCTS,
  SET_VEHICLE_TYRE_POSITION_SIZES,
  SET_VEHICLE_TYRE_RUNNING_KM,
  TYRE_NAMED_OPS,
  UPDATE_CUSTOMER_VEHICLE,
  VEHICLE_APPLICATIONS,
  VEHICLE_TYRE_POSITIONS,
  type CustomerVehicle,
  type VehicleTyrePositionsResult,
} from "@/lib/graphql/tyres";
import { DELETE_VEHICLE, LOOKUP_OPS } from "@/lib/graphql/vehicle-management";
import { axleSizeSlots, MAX_SPARES, SPARE_AXLE, spareCodes } from "@/lib/tyres/axle-layout";
import {
  useAxleApi,
  useAxleConfigurations,
  useCustomers,
  useCustomerVehicles,
  useTyreMasters,
  useTyreRunningKm,
} from "@/lib/tyres/use-tyres";
import { writeInspectVehicle } from "@/lib/tyres/inspect-selection";
import { validateCustomerVehicle, validatePrices, validateRunningKm } from "@/lib/tyres/validation";
import { intOrNull, numberOrNull, numText, textOrNull } from "@/lib/vehicle-management/helpers";
import { useErrorText, useVmLookups, useVmMutations, VM_KEY } from "@/lib/vehicle-management/use-vm";
import { validateLookupName } from "@/lib/vehicle-management/validation";
import { AddAxleConfigurationButton, AxleConfigurationsSheet } from "./axle-configurations";
import { AxleConfigSheet } from "./axle-diagram";
import { useTyreLabels } from "./tyre-labels";

const FIELDS = [
  "customerId",
  "plateNo",
  "vehicleName",
  "vehicleTypeId",
  "axleConfigurationId",
  "application",
  "dailyAvgRunningKm",
  "photoPath",
  "status",
  "spareTyreCount",
] as const;
type VehicleForm = Record<(typeof FIELDS)[number], string>;

function toForm(v: CustomerVehicle | null, customerId = ""): VehicleForm {
  if (!v)
    return {
      customerId,
      plateNo: "",
      vehicleName: "",
      vehicleTypeId: "",
      axleConfigurationId: "",
      application: "",
      dailyAvgRunningKm: "",
      photoPath: "",
      status: "active",
      spareTyreCount: "1",
    };
  return Object.fromEntries(
    FIELDS.map((k) => [k, k === "dailyAvgRunningKm" ? numText(v.dailyAvgRunningKm) : String(v[k] ?? "")]),
  ) as VehicleForm;
}

/** Form → mutation variables. GPS fields (install date, limits, subscription) aren't part of a customer vehicle. */
function toVariables(form: VehicleForm): Record<string, unknown> {
  return {
    customerId: textOrNull(form.customerId),
    plateNo: form.plateNo.trim(),
    vehicleName: textOrNull(form.vehicleName),
    vehicleTypeId: textOrNull(form.vehicleTypeId),
    axleConfigurationId: textOrNull(form.axleConfigurationId),
    application: textOrNull(form.application),
    dailyAvgRunningKm: numberOrNull(form.dailyAvgRunningKm),
    photoPath: textOrNull(form.photoPath),
    status: form.status,
    spareTyreCount: intOrNull(form.spareTyreCount),
  };
}

type AxleTyreSizes = Record<number, string>;
/** The vehicle's saved tyre size per axle (T5), as form values. */
const sizesOf = (v: CustomerVehicle | null): AxleTyreSizes =>
  Object.fromEntries((v?.axleTyreSizes ?? []).filter((s) => s.tyreSizeId).map((s) => [s.axleNo, s.tyreSizeId!]));

/** Customer vehicles: the trucks whose tyres are managed for a customer. They have no GPS device. */
export function CustomerVehiclesScreen() {
  const t = useTranslations("masters.tyres.customerVehicles");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const list = useCustomerVehicles();
  const customers = useCustomers();
  const axles = useAxleConfigurations();
  const labels = useTyreLabels();
  const { run, refresh } = useVmMutations();
  const errorText = useErrorText();
  const [customerFilter, setCustomerFilter] = useState("");
  const [axleFilter, setAxleFilter] = useState("");
  const [applicationFilter, setApplicationFilter] = useState("");
  const [editing, setEditing] = useState<CustomerVehicle | "new" | null>(null);
  const [deleting, setDeleting] = useState<CustomerVehicle | null>(null);
  // The vehicle whose axle configuration is open (clicked in the table).
  const [axleOf, setAxleOf] = useState<CustomerVehicle | null>(null);
  const [managingAxles, setManagingAxles] = useState(false);

  const customerList = useMemo(
    () =>
      [...(customers.data?.customers?.data ?? [])]
        .filter((c) => lookups.inScope(c.companyId))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [customers.data, lookups],
  );
  const customerById = useMemo(() => new Map(customerList.map((c) => [c.id, c])), [customerList]);
  const axleById = useMemo(() => new Map((axles.data ?? []).map((a) => [a.id, a])), [axles.data]);
  const axleConfig = axleOf?.axleConfigurationId ? axleById.get(axleOf.axleConfigurationId) : undefined;
  const allRows = useMemo(
    () =>
      [...(list.data?.vehicles?.data ?? [])]
        .filter((v) => lookups.inScope(v.companyId))
        .sort((a, b) => a.plateNo.localeCompare(b.plateNo)),
    [list.data, lookups],
  );
  const rows = allRows.filter(
    (v) =>
      (!customerFilter || v.customerId === customerFilter) &&
      (!axleFilter || v.axleConfigurationId === axleFilter) &&
      (!applicationFilter || v.application === applicationFilter),
  );
  const customerName = (id: string | null) => (id ? (customerById.get(id)?.name ?? `#${id}`) : "—");
  const avgKm = allRows.filter((v) => v.dailyAvgRunningKm !== null);
  const typeName = lookups.typeName;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <Button variant="secondary" onClick={() => setManagingAxles(true)}>
              <Settings2 />
              {t("axleConfigs")}
            </Button>
            <Button onClick={() => setEditing("new")} disabled={!lookups.allow("tyres", "add")}>
              <Plus />
              {t("add")}
            </Button>
          </>
        }
      />
      <KpiCards
        loading={list.isPending}
        items={[
          { key: "total", label: t("kpi.total"), value: allRows.length, icon: <Truck />, tone: "primary" },
          {
            key: "active",
            label: tc("statuses.active"),
            value: allRows.filter((v) => v.status === "active").length,
            icon: <CircleCheck />,
            tone: "ok",
          },
          {
            key: "customers",
            label: t("kpi.customers"),
            value: new Set(allRows.map((v) => v.customerId).filter(Boolean)).size,
            icon: <Users />,
            tone: "muted",
          },
          {
            key: "avgKm",
            label: t("kpi.avgKm"),
            value: avgKm.length
              ? Math.round(avgKm.reduce((s, v) => s + (v.dailyAvgRunningKm ?? 0), 0) / avgKm.length)
              : "—",
            icon: <Route />,
            tone: "muted",
          },
        ]}
      />
      <DataTable
        caption={t("title")}
        rows={rows}
        loading={list.isPending}
        error={list.error ? errorText(list.error) : null}
        searchText={(v) =>
          [v.plateNo, v.vehicleName, customerName(v.customerId), typeName(v.vehicleTypeId)].filter(Boolean).join(" ")
        }
        emptyText={allRows.length === 0 ? t("empty") : undefined}
        filters={
          <>
            <FilterSelect
              label={t("f.customer")}
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
            >
              <option value="">{tc("all")}</option>
              {customerList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label={t("f.axle")} value={axleFilter} onChange={(e) => setAxleFilter(e.target.value)}>
              <option value="">{tc("all")}</option>
              {(axles.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {labels.axle(a)}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label={t("f.application")}
              value={applicationFilter}
              onChange={(e) => setApplicationFilter(e.target.value)}
            >
              <option value="">{tc("all")}</option>
              {VEHICLE_APPLICATIONS.map((a) => (
                <option key={a} value={a}>
                  {labels.application(a)}
                </option>
              ))}
            </FilterSelect>
            <Button
              variant="secondary"
              disabled={!customerFilter && !axleFilter && !applicationFilter}
              onClick={() => {
                setCustomerFilter("");
                setAxleFilter("");
                setApplicationFilter("");
              }}
            >
              <RotateCcw />
              {tc("reset")}
            </Button>
          </>
        }
        columns={[
          {
            key: "plate",
            header: t("f.plateNo"),
            sortValue: (v) => v.plateNo,
            cell: (v) => (
              <div className="grid">
                <span className="font-medium" dir="ltr">
                  {v.plateNo}
                </span>
                {v.vehicleName ? <span className="text-xs text-muted-foreground">{v.vehicleName}</span> : null}
              </div>
            ),
          },
          {
            key: "customer",
            header: t("f.customer"),
            sortValue: (v) => customerName(v.customerId),
            cell: (v) => customerName(v.customerId),
          },
          {
            key: "type",
            header: t("f.vehicleType"),
            sortValue: (v) => typeName(v.vehicleTypeId),
            cell: (v) => typeName(v.vehicleTypeId),
          },
          {
            key: "axle",
            header: t("f.axle"),
            sortValue: (v) => (v.axleConfigurationId ? labels.axle(axleById.get(v.axleConfigurationId)) : ""),
            // Opens the vehicle's axle layout with its tyre positions.
            cell: (v) => {
              const cfg = v.axleConfigurationId ? axleById.get(v.axleConfigurationId) : undefined;
              if (!cfg) return v.axleConfigurationId ? labels.axle(cfg) : "—";
              return (
                <button
                  type="button"
                  onClick={() => setAxleOf(v)}
                  title={t("showAxles")}
                  className="rounded-md px-1.5 py-0.5 text-start font-medium text-primary underline-offset-2 hover:bg-primary-soft hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {labels.axle(cfg)}
                </button>
              );
            },
          },
          {
            key: "application",
            header: t("f.application"),
            sortValue: (v) => v.application ?? "",
            cell: (v) => labels.application(v.application),
          },
          {
            key: "km",
            header: t("f.dailyAvgKm"),
            numeric: true,
            sortValue: (v) => v.dailyAvgRunningKm,
            cell: (v) => (v.dailyAvgRunningKm === null ? "—" : t("km", { n: v.dailyAvgRunningKm })),
          },
          {
            key: "status",
            header: tc("status"),
            sortValue: (v) => v.status,
            cell: (v) => (
              <StatusBadge tone={v.status === "active" ? "ok" : "muted"}>{tc(`statuses.${v.status}`)}</StatusBadge>
            ),
          },
        ]}
        onEdit={lookups.allow("tyres", "edit") ? setEditing : undefined}
        onDelete={lookups.allow("tyres", "delete") ? setDeleting : undefined}
      />

      {editing !== null ? (
        <CustomerVehicleSheet
          vehicle={editing === "new" ? null : editing}
          defaultCustomerId={customerFilter}
          customers={customerList}
          otherPlates={[...lookups.vehicles, ...allRows]
            .filter((v) => editing === "new" || v.id !== editing.id)
            .map((v) => v.plateNo)}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {managingAxles ? <AxleConfigurationsSheet onClose={() => setManagingAxles(false)} /> : null}

      {axleOf && axleConfig ? (
        <AxleConfigSheet
          vehicleId={axleOf.id}
          plate={axleOf.plateNo}
          vehicleName={axleOf.vehicleName}
          customerName={customerName(axleOf.customerId)}
          application={axleOf.application}
          dailyKm={axleOf.dailyAvgRunningKm}
          config={axleConfig}
          onClose={() => setAxleOf(null)}
        />
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

function CustomerVehicleSheet({
  vehicle,
  defaultCustomerId,
  customers,
  otherPlates,
  onClose,
}: {
  vehicle: CustomerVehicle | null;
  defaultCustomerId: string;
  customers: Array<{ id: string; name: string; status: string }>;
  otherPlates: string[];
  onClose: () => void;
}) {
  const t = useTranslations("masters.tyres.customerVehicles");
  const tc = useTranslations("masters.common");
  const router = useRouter();
  const tvm = useTranslations("masters.vm.vehicles");
  const tv = useTranslations("masters.tyres.axleView");
  const tval = useTranslations("validation");
  const axleApi = useAxleApi();
  const lookups = useVmLookups();
  const axles = useAxleConfigurations();
  const labels = useTyreLabels();
  const { run, refresh, failInto } = useVmMutations();
  const [saved, setSaved] = useState(() => toForm(vehicle, defaultCustomerId));
  const [form, setForm] = useState(saved);
  // Tyre size per axle (kept in this browser until the backend stores it, request T5).
  const [savedSizes] = useState<AxleTyreSizes>(() => sizesOf(vehicle));
  const [axleSizes, setAxleSizes] = useState<AxleTyreSizes>(savedSizes);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  // Once each tyre can have its own size: the sizes changed here, by position code, over the saved ones.
  const [tyreEdits, setTyreEdits] = useState<Record<string, string>>({});
  const savedPositions = useQuery({
    queryKey: [VM_KEY, "vehicleTyres", vehicle?.id],
    queryFn: () => gqlRequest<VehicleTyrePositionsResult>(VEHICLE_TYRE_POSITIONS, { id: vehicle!.id }),
    enabled: Boolean(vehicle) && (axleApi.perTyreSizes || axleApi.positionProducts),
  });
  const savedTyreSizes: Record<string, string> = Object.fromEntries(
    (savedPositions.data?.vehicle?.tyrePositions ?? []).map((p) => [p.code, p.tyreSizeId ?? ""]),
  );
  // Km each tyre has already run: the figures typed here, by position code, over the saved ones.
  const [kmEdits, setKmEdits] = useState<Record<string, string>>({});
  const savedKm = useTyreRunningKm(vehicle?.id, axleApi.runningKm).byCode;
  const kmOf = (code: string) => kmEdits[code] ?? (savedKm[code] == null ? "" : String(savedKm[code]));
  // Each tyre's product and purchase price: typed here, by position code, over the saved ones.
  const [productEdits, setProductEdits] = useState<Record<string, string>>({});
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({});
  const savedPosition = new Map((savedPositions.data?.vehicle?.tyrePositions ?? []).map((p) => [p.code, p]));
  const savedPrice = (code: string) => {
    const price = savedPosition.get(code)?.purchasePrice;
    return price == null ? "" : String(price);
  };
  const priceOf = (code: string) => priceEdits[code] ?? savedPrice(code);
  const guard = useDiscardGuard(
    isDirty(form, saved) ||
      isDirty(axleSizes, savedSizes) ||
      Object.keys(tyreEdits).length > 0 ||
      Object.keys(kmEdits).length > 0 ||
      Object.keys(productEdits).length > 0 ||
      Object.keys(priceEdits).length > 0,
    onClose,
  );
  const masters = useTyreMasters();
  const tyreSizes = useMemo(
    () =>
      (masters.data?.tyreSizes?.data ?? [])
        .filter((s) => lookups.inScope(s.companyId))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    [masters.data, lookups],
  );
  // Products to pick for a tyre: the company's active ones of that tyre's size.
  const products = useMemo(
    () =>
      (masters.data?.tyreProducts?.data ?? [])
        .filter((p) => lookups.inScope(p.companyId) && p.status === "active")
        .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { numeric: true })),
    [masters.data, lookups],
  );
  const productsOfSize = (sizeId: string) => products.filter((p) => p.tyreSizeId === sizeId);
  const selectedAxle = (axles.data ?? []).find((a) => a.id === form.axleConfigurationId);
  const sizeSlots = selectedAxle ? axleSizeSlots(selectedAxle.positions, Number(form.spareTyreCount) || 0) : [];
  const slotName = (slot: (typeof sizeSlots)[number]) =>
    slot.kind === "spare"
      ? t("sizes.spare")
      : slot.kind === "steer"
        ? t("sizes.steer")
        : slot.kind === "drive"
          ? t("sizes.drive", { n: slot.kindNo })
          : slot.kind === "trailer"
            ? t("sizes.trailer", { n: slot.kindNo })
            : t("sizes.axle", { n: slot.axleNo });

  /** Every tyre of the layout on an axle (front to back), or the spares (SP1, SP2 …). */
  const tyresOf = (axleNo: number) =>
    axleNo === SPARE_AXLE
      ? spareCodes(Number(form.spareTyreCount) || 0).map((code) => ({ code, label: code }))
      : [...(selectedAxle?.positions ?? [])]
          .filter((p) => p.axleNo === axleNo)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((p) => ({ code: p.code, label: `${p.code} · ${tv(`sides.${p.side}`)}` }));
  const allTyres = sizeSlots.flatMap((s) => tyresOf(s.axleNo).map((x) => ({ ...x, axleNo: s.axleNo })));
  /** A tyre's size: its own once the backend keeps one per tyre; until then its axle's. */
  const sizeOf = (code: string, axleNo: number) =>
    axleApi.perTyreSizes ? (tyreEdits[code] ?? savedTyreSizes[code] ?? "") : (axleSizes[axleNo] ?? "");
  const setSize = (code: string, axleNo: number, sizeId: string) =>
    axleApi.perTyreSizes
      ? setTyreEdits((e) => ({ ...e, [code]: sizeId }))
      : setAxleSizes((s) => ({ ...s, [axleNo]: sizeId }));
  const firstSize = allTyres[0] ? sizeOf(allTyres[0].code, allTyres[0].axleNo) : "";
  /** A tyre's product: only one of its size counts (a size change clears it, as the API does). */
  const productOf = (code: string, axleNo: number) => {
    const id = productEdits[code] ?? savedPosition.get(code)?.tyreProductId ?? "";
    return productsOfSize(sizeOf(code, axleNo)).some((p) => p.id === id) ? id : "";
  };
  /** Gives every tyre on an axle the first tyre's size, product and price. */
  const copyFirstOnAxle = (axleNo: number) => {
    const [first, ...rest] = tyresOf(axleNo);
    if (!first || !rest.length) return;
    const pick = (value: string) => Object.fromEntries(rest.map((x) => [x.code, value]));
    if (axleApi.perTyreSizes) setTyreEdits((e) => ({ ...e, ...pick(sizeOf(first.code, axleNo)) }));
    setProductEdits((e) => ({ ...e, ...pick(productOf(first.code, axleNo)) }));
    setPriceEdits((e) => ({ ...e, ...pick(priceOf(first.code)) }));
  };
  const clearError = (key: string) =>
    setErrors((all) => Object.fromEntries(Object.entries(all).filter(([k]) => k !== key)));
  const applyFirstToAll = () =>
    axleApi.perTyreSizes
      ? setTyreEdits(Object.fromEntries(allTyres.map((x) => [x.code, firstSize])))
      : setAxleSizes(Object.fromEntries(sizeSlots.map((s) => [s.axleNo, firstSize])));

  const set = (key: keyof VehicleForm, value: string) => setForm((f) => ({ ...f, [key]: value }));

  /** A new vehicle with an axle layout can go straight to its first inspection. */
  const canInspect = !vehicle && Boolean(form.axleConfigurationId) && lookups.allow("tyres", "add");

  /** Saves the vehicle; with `inspect`, then opens New inspection with it picked. */
  const save = async ({ inspect = false }: { inspect?: boolean } = {}) => {
    const found = {
      ...validateCustomerVehicle(form, otherPlates),
      ...validateRunningKm(Object.fromEntries(allTyres.map((x) => [x.code, kmOf(x.code)]))),
      ...validatePrices(Object.fromEntries(allTyres.map((x) => [x.code, priceOf(x.code)]))),
    };
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error(tc("fixErrors"));
      return;
    }
    if (!lookups.companyId) return;
    setPending(true);
    try {
      const vars = toVariables(form);
      let id = vehicle?.id;
      if (vehicle) await run(UPDATE_CUSTOMER_VEHICLE, { id: vehicle.id, ...vars }, { previous: toVariables(saved) });
      else
        id = (
          await run<{ createVehicle: { id: string } }>(CREATE_CUSTOMER_VEHICLE, {
            companyId: lookups.companyId,
            ...vars,
          })
        ).createVehicle.id;
      // Tyre sizes, saved with the vehicle when there's an axle layout and something changed: only
      // the tyres changed here once each tyre has its own size, else every axle's (T5).
      if (id && sizeSlots.length) {
        if (axleApi.perTyreSizes) {
          const changed = allTyres.filter(
            (x) => x.code in tyreEdits && tyreEdits[x.code] !== (savedTyreSizes[x.code] ?? ""),
          );
          if (changed.length) {
            await run(SET_VEHICLE_TYRE_POSITION_SIZES, {
              vehicleId: id,
              sizes: changed.map((x) => ({ positionCode: x.code, tyreSizeId: tyreEdits[x.code] || null })),
            });
          }
        } else if (!vehicle || isDirty(axleSizes, savedSizes)) {
          await run(SET_VEHICLE_AXLE_TYRE_SIZES, {
            vehicleId: id,
            sizes: sizeSlots.map((s) => ({ axleNo: s.axleNo, tyreSizeId: axleSizes[s.axleNo] || null })),
          });
        }
        // Km already run, once the backend keeps it: only the tyres changed here.
        const kmChanged = allTyres.filter(
          (x) =>
            x.code in kmEdits && kmEdits[x.code].trim() !== (savedKm[x.code] == null ? "" : String(savedKm[x.code])),
        );
        if (axleApi.runningKm && kmChanged.length) {
          await run(SET_VEHICLE_TYRE_RUNNING_KM, {
            vehicleId: id,
            tyres: kmChanged.map((x) => ({ positionCode: x.code, runningKm: intOrNull(kmEdits[x.code]) })),
          });
        }
        // Each tyre's product and price (after its size, since the product must match it): only the
        // tyres changed here, and only where there's a tyre (a size).
        const productChanged = allTyres.filter(
          (x) =>
            sizeOf(x.code, x.axleNo) &&
            (x.code in productEdits || x.code in priceEdits) &&
            (productOf(x.code, x.axleNo) !== (savedPosition.get(x.code)?.tyreProductId ?? "") ||
              priceOf(x.code).trim() !== savedPrice(x.code)),
        );
        if (axleApi.positionProducts && productChanged.length) {
          await run(SET_VEHICLE_TYRE_POSITION_PRODUCTS, {
            vehicleId: id,
            tyres: productChanged.map((x) => ({
              positionCode: x.code,
              tyreProductId: productOf(x.code, x.axleNo) || null,
              purchasePrice: numberOrNull(priceOf(x.code)),
            })),
          });
        }
      }
      setSaved(form);
      await refresh();
      toast.success(tc("saved"));
      onClose();
      if (inspect && id) {
        writeInspectVehicle(id);
        router.push("/tyre-inspections");
      }
    } catch (err) {
      failInto(err, setErrors);
    } finally {
      setPending(false);
    }
  };

  const text = (
    key: keyof VehicleForm,
    label: string,
    opts: { required?: boolean; type?: string; dir?: "ltr"; hint?: ReactNode } = {},
  ) => (
    <Field id={`cv-${key}`} label={opts.required ? `${label} *` : label} error={errors[key]} hint={opts.hint}>
      <Input
        id={`cv-${key}`}
        type={opts.type ?? "text"}
        step={opts.type === "number" ? "any" : undefined}
        inputMode={opts.type === "number" ? "decimal" : undefined}
        min={opts.type === "number" ? 0 : undefined}
        dir={opts.dir}
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        aria-invalid={errors[key] ? true : undefined}
      />
    </Field>
  );

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && guard.requestClose()}
      size="xl"
      title={vehicle ? t("editTitle", { plate: vehicle.plateNo }) : t("add")}
      description={t("formDescription")}
      footer={
        <>
          <Button variant="secondary" onClick={guard.requestClose}>
            {tc("cancel")}
          </Button>
          <Button variant={vehicle ? "primary" : "secondary"} onClick={() => void save()} disabled={pending}>
            {pending ? tc("saving") : tc("save")}
          </Button>
          {!vehicle ? (
            <Button
              onClick={() => void save({ inspect: true })}
              disabled={pending || !canInspect}
              title={form.axleConfigurationId ? undefined : t("saveInspectHint")}
            >
              {t("saveInspect")}
              <ArrowRight className="rtl:rotate-180" />
            </Button>
          ) : null}
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
        <FormSection title={t("sections.vehicle")}>
          <div className="sm:col-span-2">
            <Field
              id="cv-customerId"
              label={`${t("f.customer")} *`}
              error={errors.customerId}
              hint={customers.length ? undefined : t("noCustomers")}
            >
              <Select
                id="cv-customerId"
                value={form.customerId}
                onChange={(e) => set("customerId", e.target.value)}
                aria-invalid={errors.customerId ? true : undefined}
              >
                <option value="">{tc("choose")}</option>
                {customers
                  .filter((c) => c.status === "active" || c.id === form.customerId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>
          {text("plateNo", t("f.plateNo"), { required: true, dir: "ltr" })}
          {text("vehicleName", t("f.vehicleName"))}
          <Field id="cv-vehicleTypeId" label={`${t("f.vehicleType")} *`} error={errors.vehicleTypeId}>
            <SelectWithAdd
              id="cv-vehicleTypeId"
              value={form.vehicleTypeId}
              onChange={(v) => set("vehicleTypeId", v)}
              invalid={Boolean(errors.vehicleTypeId)}
              placeholder={tc("choose")}
              options={lookups.vehicleTypes
                .filter((ty) => ty.status === "active" || ty.id === form.vehicleTypeId)
                .map((ty) => ({ id: ty.id, label: ty.name }))}
              addLabel={tvm("addType")}
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
          <Field id="cv-status" label={tc("status")}>
            <Select id="cv-status" value={form.status} onChange={(e) => set("status", e.target.value)}>
              <option value="active">{tc("statuses.active")}</option>
              <option value="inactive">{tc("statuses.inactive")}</option>
            </Select>
          </Field>
        </FormSection>

        <FormSection title={t("sections.usage")} description={t("usageNote")}>
          <Field id="cv-axleConfigurationId" label={t("f.axle")}>
            <div className="flex gap-2">
              <Select
                id="cv-axleConfigurationId"
                className="min-w-0 flex-1"
                value={form.axleConfigurationId}
                onChange={(e) => set("axleConfigurationId", e.target.value)}
              >
                <option value="">{tc("none")}</option>
                {(axles.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {labels.axle(a)} · {t("tyreCount", { n: a.positions.length })}
                  </option>
                ))}
              </Select>
              {/* A new layout of the company's own, picked as soon as it's saved. */}
              <AddAxleConfigurationButton onAdded={(id) => set("axleConfigurationId", id)} />
            </div>
          </Field>
          <Field id="cv-application" label={t("f.application")}>
            <Select id="cv-application" value={form.application} onChange={(e) => set("application", e.target.value)}>
              <option value="">{tc("none")}</option>
              {VEHICLE_APPLICATIONS.map((a) => (
                <option key={a} value={a}>
                  {labels.application(a)}
                </option>
              ))}
            </Select>
          </Field>
          {text("dailyAvgRunningKm", t("f.dailyAvgKm"), { type: "number" })}
          <Field id="cv-spareTyreCount" label={t("f.spares")} hint={t("f.sparesHint")}>
            <Select
              id="cv-spareTyreCount"
              value={form.spareTyreCount}
              onChange={(e) => set("spareTyreCount", e.target.value)}
            >
              {Array.from({ length: MAX_SPARES + 1 }, (_, n) => (
                <option key={n} value={String(n)}>
                  {t("f.spareCount", { n })}
                </option>
              ))}
            </Select>
          </Field>
        </FormSection>

        {selectedAxle ? (
          <FormSection
            title={t("sizes.title")}
            description={axleApi.perTyreSizes ? t("sizes.descriptionTyre") : t("sizes.descriptionAxle")}
            columns={1}
          >
            {!axleApi.isPending && !axleApi.runningKm ? <Alert tone="info">{t("sizes.runningKmSoon")}</Alert> : null}
            {sizeSlots.map((slot) => (
              <fieldset key={slot.axleNo} className="grid gap-3 rounded-xl border border-border/70 p-3">
                <legend className="px-1 text-xs font-semibold">
                  {slotName(slot)} · {t("tyreCount", { n: slot.tyres })}
                </legend>
                <div className="grid gap-2">
                  <div
                    className="hidden gap-2 px-1 text-[11px] font-medium text-muted-foreground sm:grid sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1.4fr)_6.5rem_6.5rem]"
                    aria-hidden
                  >
                    <span>{t("sizes.cols.tyre")}</span>
                    <span>{t("sizes.cols.size")}</span>
                    <span>{t("sizes.cols.product")}</span>
                    <span>{t("sizes.cols.price")}</span>
                    <span>{t("sizes.runningKm")}</span>
                  </div>
                  {tyresOf(slot.axleNo).map((tyre) => {
                    const size = sizeOf(tyre.code, slot.axleNo);
                    const error = errors[`price-${tyre.code}`] || errors[`km-${tyre.code}`];
                    return (
                      <div
                        key={tyre.code}
                        className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1.4fr)_6.5rem_6.5rem]"
                      >
                        <span className="col-span-2 text-xs font-semibold sm:col-span-1" dir="ltr">
                          {tyre.label}
                        </span>
                        <div>
                          <label htmlFor={`cv-size-${tyre.code}`} className="sr-only">
                            {`${t("sizes.cols.size")} · ${tyre.code}`}
                          </label>
                          <SelectWithAdd
                            id={`cv-size-${tyre.code}`}
                            value={size}
                            onChange={(v) => setSize(tyre.code, slot.axleNo, v)}
                            placeholder={t("sizes.choose")}
                            options={tyreSizes.map((x) => ({ id: x.id, label: x.name }))}
                            addLabel={t("sizes.add")}
                            canAdd={lookups.allow("tyres", "add")}
                            validate={({ name }) => validateLookupName(name, tyreSizes)}
                            onCreate={async ({ name }) => {
                              const res = await run<{ createTyreSize: { id: string } }>(TYRE_NAMED_OPS.size.create, {
                                companyId: lookups.companyId,
                                name,
                              });
                              await refresh();
                              return res.createTyreSize.id;
                            }}
                          />
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                          <label htmlFor={`cv-product-${tyre.code}`} className="sr-only">
                            {`${t("sizes.cols.product")} · ${tyre.code}`}
                          </label>
                          <Select
                            id={`cv-product-${tyre.code}`}
                            value={productOf(tyre.code, slot.axleNo)}
                            // Only a tyre with a size can have a product (of that size).
                            disabled={!axleApi.positionProducts || !size}
                            onChange={(e) => setProductEdits((p) => ({ ...p, [tyre.code]: e.target.value }))}
                          >
                            <option value="">{size ? t("sizes.noProduct") : t("sizes.sizeFirst")}</option>
                            {productsOfSize(size).map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.displayName}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <Input
                          id={`cv-price-${tyre.code}`}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="any"
                          placeholder={t("sizes.cols.price")}
                          disabled={!axleApi.positionProducts || !size}
                          value={priceOf(tyre.code)}
                          onChange={(e) => {
                            setPriceEdits((p) => ({ ...p, [tyre.code]: e.target.value }));
                            clearError(`price-${tyre.code}`);
                          }}
                          aria-invalid={errors[`price-${tyre.code}`] ? true : undefined}
                          aria-label={`${t("sizes.cols.price")} · ${tyre.code}`}
                        />
                        <Input
                          id={`cv-km-${tyre.code}`}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          placeholder={t("sizes.runningKm")}
                          disabled={!axleApi.runningKm}
                          value={kmOf(tyre.code)}
                          onChange={(e) => {
                            setKmEdits((k) => ({ ...k, [tyre.code]: e.target.value }));
                            clearError(`km-${tyre.code}`);
                          }}
                          aria-invalid={errors[`km-${tyre.code}`] ? true : undefined}
                          aria-label={`${t("sizes.runningKm")} · ${tyre.code}`}
                        />
                        {error ? <p className="col-span-full text-xs text-destructive">{tval(error)}</p> : null}
                      </div>
                    );
                  })}
                </div>
                {tyresOf(slot.axleNo).length > 1 ? (
                  <div>
                    <Button variant="ghost" size="sm" onClick={() => copyFirstOnAxle(slot.axleNo)}>
                      {t("sizes.copyAxle")}
                    </Button>
                  </div>
                ) : null}
              </fieldset>
            ))}
            {allTyres.length > 1 ? (
              <div>
                <Button variant="secondary" size="sm" disabled={!firstSize} onClick={applyFirstToAll}>
                  {t("sizes.useForAll")}
                </Button>
              </div>
            ) : null}
          </FormSection>
        ) : null}

        <FormSection title={t("sections.photo")} columns={1}>
          <Field id="cv-photoPath" label={t("f.photo")}>
            <FileUpload
              id="cv-photoPath"
              purpose="vehicle_photo"
              value={form.photoPath}
              onChange={(url) => set("photoPath", url)}
            />
          </Field>
        </FormSection>
        <button type="submit" hidden />
      </form>
      {guard.dialog}
    </Sheet>
  );
}
