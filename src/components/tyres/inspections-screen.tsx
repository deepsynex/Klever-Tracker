"use client";

import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  ClipboardCheck,
  FileBarChart,
  Plus,
  Save,
  TriangleAlert,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/masters/data-table";
import { FileUpload } from "@/components/masters/file-upload";
import { FormSection, KpiCards, PageHeader, StatusBadge } from "@/components/masters/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { formatInCompanyTz, useCompanyTimeZone } from "@/lib/company-time";
import { CREATE_TYRE_INSPECTION, positionProduct, type InspectionPosition } from "@/lib/graphql/tyre-inspections";
import { axleRows, SPARE_AXLE } from "@/lib/tyres/axle-layout";
import {
  emptyReading,
  inspectionInput,
  suggestedCodes,
  validateHeader,
  validateReading,
  type Reading,
} from "@/lib/tyres/inspection";
import {
  averageTread,
  pressureCondition,
  runningKmAt,
  treadCondition,
  TYRE_CONDITIONS,
  wearCondition,
  wearPercent,
} from "@/lib/tyres/metrics";
import { takeInspectVehicle } from "@/lib/tyres/inspect-selection";
import { writeReportVehicle } from "@/lib/tyres/report-selection";
import { useInspectionVehicle, useTyreInspections, useTyreSettings } from "@/lib/tyres/use-tyre-api";
import {
  useAxleApi,
  useAxleConfigurations,
  useCustomers,
  useCustomerVehicles,
  useTyreMasters,
  useTyreRunningKm,
} from "@/lib/tyres/use-tyres";
import { companyNowTime, companyPartsToUtc, companyToday } from "@/lib/vehicle-management/helpers";
import { useErrorText, useVmLookups, useVmMutations } from "@/lib/vehicle-management/use-vm";
import { cn } from "@/lib/utils";
import { AxleDiagram } from "./axle-diagram";
import { CONDITION_RING, conditionTone, useConditionLabel } from "./conditions";

/** Inspections (TYRE_MODULE_PLAN.md §8): the list of visits, and the New inspection flow. */
export function TyreInspectionsScreen() {
  const t = useTranslations("masters.tyres.inspections");
  const zone = useCompanyTimeZone();
  const router = useRouter();
  const lookups = useVmLookups();
  const list = useTyreInspections(null);
  const errorText = useErrorText();
  // A New inspection for one vehicle, started from Customer vehicles' "Save & inspect" (taken once).
  const [creating, setCreating] = useState(false);
  const [startVehicleId, setStartVehicleId] = useState("");
  useEffect(() => {
    const id = takeInspectVehicle();
    if (!id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hand-off from browser storage
    setStartVehicleId(id);
    setCreating(true);
  }, []);

  const rows = useMemo(
    () =>
      (list.data ?? [])
        .filter((i) => lookups.inScope(i.vehicle?.companyId))
        .sort((a, b) => b.inspectedAt.localeCompare(a.inspectedAt)),
    [list.data, lookups],
  );

  if (creating)
    return (
      <NewInspection
        initialVehicleId={startVehicleId}
        onDone={() => {
          setCreating(false);
          setStartVehicleId("");
        }}
      />
    );

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => setCreating(true)} disabled={!lookups.allow("tyres", "add")}>
            <Plus />
            {t("new")}
          </Button>
        }
      />
      <KpiCards
        loading={list.isPending}
        items={[
          { key: "total", label: t("kpi.total"), value: rows.length, icon: <ClipboardCheck />, tone: "primary" },
          {
            key: "vehicles",
            label: t("kpi.vehicles"),
            value: new Set(rows.map((r) => r.vehicleId)).size,
            icon: <CircleCheck />,
            tone: "muted",
          },
          {
            key: "attention",
            label: t("kpi.attention"),
            value: rows.filter((r) => r.items.some((i) => i.treadCondition === "needs_replacement")).length,
            icon: <TriangleAlert />,
            tone: "bad",
          },
        ]}
      />
      <DataTable
        caption={t("title")}
        rows={rows}
        loading={list.isPending}
        error={list.error ? errorText(list.error) : null}
        emptyText={t("empty")}
        searchText={(r) => [r.vehicle?.plateNo, r.inspector?.name, r.remarks].filter(Boolean).join(" ")}
        columns={[
          {
            key: "at",
            header: t("cols.inspectedAt"),
            sortValue: (r) => r.inspectedAt,
            cell: (r) => (
              <span className="whitespace-nowrap" dir="ltr">
                {formatInCompanyTz(r.inspectedAt, zone, "dd-MM-yyyy HH:mm")}
              </span>
            ),
          },
          {
            key: "vehicle",
            header: t("cols.vehicle"),
            sortValue: (r) => r.vehicle?.plateNo ?? "",
            cell: (r) => (
              <span className="font-medium" dir="ltr">
                {r.vehicle?.plateNo ?? `#${r.vehicleId}`}
              </span>
            ),
          },
          {
            key: "odometer",
            header: t("cols.odometer"),
            numeric: true,
            sortValue: (r) => r.odometerKm,
            cell: (r) => (r.odometerKm === null ? "—" : t("km", { n: r.odometerKm })),
          },
          {
            key: "tyres",
            header: t("cols.tyres"),
            numeric: true,
            sortValue: (r) => r.items.length,
            cell: (r) => r.items.length,
          },
          {
            key: "replace",
            header: t("cols.toReplace"),
            numeric: true,
            sortValue: (r) => r.items.filter((i) => i.treadCondition === "needs_replacement").length,
            cell: (r) => r.items.filter((i) => i.treadCondition === "needs_replacement").length,
          },
          {
            key: "inspector",
            header: t("cols.inspector"),
            sortValue: (r) => r.inspector?.name ?? "",
            cell: (r) => r.inspector?.name ?? "—",
          },
        ]}
        timestamps={false}
        rowActions={(r) => (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              writeReportVehicle(r.vehicleId);
              router.push("/tyre-report");
            }}
          >
            <FileBarChart />
            {t("report")}
          </Button>
        )}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// New inspection
// ---------------------------------------------------------------------------------------------

type Step = "vehicle" | "tyres" | "review";

/**
 * The visit, tablet-first: pick the customer and vehicle and read the odometer; tap each tyre on the
 * axle drawing and enter its pressure, three groove depths, condition, photo, remarks and
 * recommendations (conditions are shown live); then review and save the whole visit at once.
 */
function NewInspection({ initialVehicleId = "", onDone }: { initialVehicleId?: string; onDone: () => void }) {
  const t = useTranslations("masters.tyres.inspections");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const { thresholds } = useTyreSettings();
  const customers = useCustomers();
  const vehicles = useCustomerVehicles();
  const axles = useAxleConfigurations();
  const masters = useTyreMasters();
  const { run, refresh, fail } = useVmMutations();
  const condition = useConditionLabel();

  const [step, setStep] = useState<Step>("vehicle");
  const [customerId, setCustomerId] = useState("");
  const [header, setHeader] = useState({
    vehicleId: initialVehicleId,
    date: companyToday(),
    time: companyNowTime(),
    odometerKm: "",
    remarks: "",
  });
  const [headerErrors, setHeaderErrors] = useState<Record<string, string>>({});
  const [readings, setReadings] = useState<Record<string, Reading>>({});
  // Recommendations follow the conditions until the inspector ticks one by hand.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [active, setActive] = useState<string | null>(null);
  const [readingErrors, setReadingErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const vehicle = useInspectionVehicle(header.vehicleId || null);
  const v = vehicle.data ?? null;
  const config = (axles.data ?? []).find((a) => a.id === v?.axleConfigurationId) ?? null;
  const positions = useMemo(() => [...(v?.tyrePositions ?? [])].sort((a, b) => a.sortOrder - b.sortOrder), [v]);
  // Every position with a tyre: a serial-numbered one, or just the axle's size (the axle drawing's plan).
  const fitted = positions.filter((p) => p.fitted || p.tyre);
  const byCode = new Map(positions.map((p) => [p.code, p]));
  /** The product's recommended pressure, where the position has a tyre with a product. */
  const productPsi = (code: string) => {
    const p = byCode.get(code);
    return p ? (positionProduct(p).product?.recommendedPressurePsi ?? null) : null;
  };
  const readingOf = (code: string) => readings[code] ?? emptyReading(productPsi(code));
  // Km each tyre has run by this visit's odometer (or the vehicle's, until it's read).
  const axleApi = useAxleApi();
  const recordedKm = useTyreRunningKm(header.vehicleId || null, axleApi.runningKm).byCode;
  const readOdometer = header.odometerKm.trim() ? Number(header.odometerKm) : null;
  const runningOf = (p: InspectionPosition) =>
    runningKmAt(
      { recordedKm: recordedKm[p.code], fittedOdometerKm: p.fitment?.fittedOdometerKm },
      v?.odometerKm,
      Number.isFinite(readOdometer) ? readOdometer : null,
    );
  const recommendations = (masters.data?.tyreRecommendations?.data ?? [])
    .filter((r) => lookups.inScope(r.companyId))
    .sort((a, b) => a.title.localeCompare(b.title));

  const customerList = (customers.data?.customers?.data ?? [])
    .filter((c) => lookups.inScope(c.companyId) && c.status === "active")
    .sort((a, b) => a.name.localeCompare(b.name));
  const vehicleList = (vehicles.data?.vehicles?.data ?? [])
    .filter((x) => lookups.inScope(x.companyId) && (!customerId || x.customerId === customerId))
    .sort((a, b) => a.plateNo.localeCompare(b.plateNo));

  // The API's UTC format, "YYYY-MM-DD HH:MM:SS" (the helper returns ISO).
  const atIso = header.date && header.time ? companyPartsToUtc(header.date, header.time) : null;
  const atUtc = atIso ? atIso.slice(0, 19).replace("T", " ") : null;
  const nowUtc = new Date().toISOString().slice(0, 19).replace("T", " ");
  const metricsOf = (p: InspectionPosition, r: Reading | undefined) => {
    const n = (s: string | undefined) => (s && s.trim() ? Number(s) : null);
    const outer = n(r?.outer);
    const center = n(r?.center);
    const inner = n(r?.inner);
    const avg = averageTread(outer, center, inner);
    const recommended = n(r?.recommendedPsi) ?? positionProduct(p).product?.recommendedPressurePsi ?? null;
    return {
      avg,
      tread: treadCondition([outer, center, inner], thresholds),
      pressure: pressureCondition(n(r?.actualPressurePsi), recommended, thresholds),
      wear: wearCondition(outer, center, inner),
      wearPct: wearPercent(avg, positionProduct(p).product?.originalTreadDepthMm ?? null),
    };
  };
  const recsFor = (code: string): string[] => {
    const r = readings[code];
    if (!r) return [];
    if (touched[code]) return r.recommendationIds;
    const p = byCode.get(code);
    if (!p) return [];
    const codes = suggestedCodes(metricsOf(p, r));
    return recommendations.filter((rec) => codes.includes(rec.code)).map((rec) => rec.id);
  };
  const isDone = (code: string) => Boolean(readings[code]) && !Object.keys(validateReading(readings[code]!)).length;
  const doneCount = fitted.filter((p) => isDone(p.code)).length;
  const rings = Object.fromEntries(
    fitted
      .filter((p) => isDone(p.code))
      .map((p) => [p.code, CONDITION_RING[metricsOf(p, readings[p.code]).tread ?? "good"]]),
  );

  const goTyres = () => {
    const found = validateHeader(header, { lastOdometerKm: v?.odometerKm ?? null, nowUtc, atUtc });
    setHeaderErrors(found);
    if (Object.keys(found).length) return;
    setActive(fitted[0]?.code ?? null);
    setStep("tyres");
  };
  const setReading = (code: string, patch: Partial<Reading>) =>
    setReadings((all) => ({ ...all, [code]: { ...(all[code] ?? emptyReading(productPsi(code))), ...patch } }));
  const saveReading = () => {
    if (!active) return;
    const found = validateReading(readingOf(active));
    setReadingErrors(found);
    if (Object.keys(found).length) return;
    // Keep the recommendations as shown (suggested ones included) and go to the next tyre.
    setReading(active, { recommendationIds: recsFor(active) });
    setTouched((x) => ({ ...x, [active]: true }));
    const next = fitted.find((p) => p.code !== active && !isDone(p.code));
    setActive(next?.code ?? active);
    setReadingErrors({});
    if (!next) setStep("review");
  };

  const save = async () => {
    if (!atUtc) return;
    setSaving(true);
    try {
      const effective = Object.fromEntries(
        Object.entries(readings).map(([code, r]) => [code, { ...r, recommendationIds: recsFor(code) }]),
      );
      const input = inspectionInput(
        header,
        atUtc,
        effective,
        positions.map((p) => ({ code: p.code, tyreId: p.tyre?.id ?? null })),
      );
      await run(CREATE_TYRE_INSPECTION, { input });
      await refresh();
      toast.success(t("saved", { n: input.items.length }));
      onDone();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  };

  const activePos = active ? byCode.get(active) : undefined;
  const reading = active ? readingOf(active) : emptyReading();
  const live = activePos ? metricsOf(activePos, readings[active!]) : null;
  const axleRowsOf = useMemo(() => (config ? axleRows(config.positions) : []), [config]);
  const axleLabel = (axleNo: number) => {
    if (axleNo === SPARE_AXLE) return t("spare");
    const row = axleRowsOf.find((r) => r.axleNo === axleNo);
    return row ? t(`axle.${row.kind}`, { n: row.kindNo }) : String(axleNo);
  };

  const steps: Array<[Step, string]> = [
    ["vehicle", t("steps.vehicle")],
    ["tyres", t("steps.tyres", { done: doneCount, total: fitted.length })],
    ["review", t("steps.review")],
  ];

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={onDone}>
          <ArrowLeft className="rtl:rotate-180" />
          {t("back")}
        </Button>
        <h1 className="text-xl font-bold">{t("new")}</h1>
      </div>

      <ol className="grid grid-cols-3 gap-2" aria-label={t("steps.label")}>
        {steps.map(([key, label], i) => (
          <li key={key}>
            <button
              type="button"
              disabled={key !== "vehicle" && !header.vehicleId}
              onClick={() => (key === "vehicle" ? setStep("vehicle") : key === "tyres" ? goTyres() : setStep("review"))}
              aria-current={step === key ? "step" : undefined}
              className={cn(
                "flex w-full items-center gap-2 rounded-xl border px-3 py-3 text-start text-sm font-semibold disabled:opacity-50",
                step === key
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border/70 bg-surface hover:bg-surface-2",
              )}
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-xs">{i + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      {step === "vehicle" ? (
        <div className="grid gap-5 rounded-2xl border border-border/70 bg-surface p-5">
          <FormSection title={t("steps.vehicle")}>
            <Field id="in-customer" label={t("f.customer")}>
              <Select
                id="in-customer"
                // A vehicle handed over from Customer vehicles shows its customer.
                value={customerId || v?.customerId || ""}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  setHeader((h) => ({ ...h, vehicleId: "" }));
                }}
              >
                <option value="">{tc("all")}</option>
                {customerList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="in-vehicle" label={`${t("f.vehicle")} *`} error={headerErrors.vehicleId}>
              <Select
                id="in-vehicle"
                value={header.vehicleId}
                onChange={(e) => {
                  const id = e.target.value;
                  const picked = vehicleList.find((x) => x.id === id);
                  setHeader((h) => ({ ...h, vehicleId: id, odometerKm: "" }));
                  if (picked?.customerId) setCustomerId(picked.customerId);
                  setReadings({});
                  setTouched({});
                }}
              >
                <option value="">{tc("choose")}</option>
                {vehicleList.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.vehicleName ? `${x.plateNo} (${x.vehicleName})` : x.plateNo}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="in-date" label={`${t("f.date")} *`} error={headerErrors.date}>
              <Input
                id="in-date"
                type="date"
                value={header.date}
                onChange={(e) => setHeader((h) => ({ ...h, date: e.target.value }))}
              />
            </Field>
            <Field id="in-time" label={`${t("f.time")} *`} error={headerErrors.time}>
              <Input
                id="in-time"
                type="time"
                value={header.time}
                onChange={(e) => setHeader((h) => ({ ...h, time: e.target.value }))}
              />
            </Field>
            <Field
              id="in-odometer"
              label={`${t("f.odometer")} *`}
              error={headerErrors.odometerKm}
              hint={v?.odometerKm != null ? t("f.lastOdometer", { n: v.odometerKm }) : undefined}
            >
              <Input
                id="in-odometer"
                type="number"
                inputMode="numeric"
                min={0}
                className="h-12 text-lg"
                value={header.odometerKm}
                onChange={(e) => setHeader((h) => ({ ...h, odometerKm: e.target.value }))}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field id="in-remarks" label={t("f.remarks")}>
                <Textarea
                  id="in-remarks"
                  rows={2}
                  value={header.remarks}
                  onChange={(e) => setHeader((h) => ({ ...h, remarks: e.target.value }))}
                />
              </Field>
            </div>
          </FormSection>
          {header.vehicleId && v && !config ? <Alert tone="warning">{t("noAxles")}</Alert> : null}
          {header.vehicleId && v && config && !fitted.length ? <Alert tone="warning">{t("noTyres")}</Alert> : null}
          <div className="flex justify-end">
            <Button size="lg" onClick={goTyres} disabled={!header.vehicleId || !config || !fitted.length}>
              {t("next")}
              <ArrowRight className="rtl:rotate-180" />
            </Button>
          </div>
        </div>
      ) : null}

      {step === "tyres" && config ? (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="grid gap-3 rounded-2xl border border-border/70 bg-surface p-4 lg:sticky lg:top-20">
            <AxleDiagram
              config={config}
              highlight={active}
              occupancy={Object.fromEntries(
                positions.map((p) => [
                  p.code,
                  p.fitted || p.tyre ? (p.tyre?.serialNo ?? p.tyreSize?.name ?? p.code) : null,
                ]),
              )}
              spares={positions.filter((p) => p.isSpare).map((p) => p.code)}
              rings={rings}
              onSelect={(code) => {
                setActive(code);
                setReadingErrors({});
              }}
            />
            <ul className="flex flex-wrap gap-1.5" aria-label={t("positionsLabel")}>
              {fitted.map((p) => (
                <li key={p.code}>
                  <button
                    type="button"
                    onClick={() => {
                      setActive(p.code);
                      setReadingErrors({});
                    }}
                    className={cn(
                      "inline-flex min-h-10 items-center gap-1 rounded-lg border px-2.5 font-mono text-xs font-semibold",
                      active === p.code
                        ? "border-primary bg-primary-soft text-primary"
                        : "border-border/70 hover:bg-surface-2",
                    )}
                    dir="ltr"
                  >
                    {isDone(p.code) ? <CircleCheck className="size-3.5 text-green-600" aria-hidden /> : null}
                    {p.code}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {activePos && (activePos.fitted || activePos.tyre) ? (
            <div className="grid gap-4 rounded-2xl border border-border/70 bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    {axleLabel(activePos.axleNo)}
                    {activePos.side ? ` · ${t(`side.${activePos.side}`)}` : ""}
                  </p>
                  <h2 className="font-mono text-lg font-bold" dir="ltr">
                    {activePos.code}
                    {activePos.tyre ? ` · ${activePos.tyre.serialNo}` : ""}
                  </h2>
                  <p className="text-sm text-muted-foreground" dir="ltr">
                    {positionProduct(activePos).product?.displayName ?? activePos.tyreSize?.name ?? ""}
                  </p>
                </div>
                <div className="grid gap-0.5 text-end text-xs text-muted-foreground">
                  <p>{t("original", { n: positionProduct(activePos).product?.originalTreadDepthMm ?? "—" })}</p>
                  <p>
                    {t("running")}{" "}
                    <span className="font-semibold text-foreground">
                      {runningOf(activePos) === null ? "—" : t("km", { n: runningOf(activePos)! })}
                    </span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {(
                  [
                    ["actualPressurePsi", t("f.pressure")],
                    ["recommendedPsi", t("f.recommendedPsi")],
                    ["outer", t("f.outer")],
                    ["center", t("f.center")],
                    ["inner", t("f.inner")],
                  ] as const
                ).map(([key, label]) => (
                  <Field
                    key={key}
                    id={`in-${key}`}
                    label={key === "recommendedPsi" ? label : `${label} *`}
                    error={readingErrors[key]}
                  >
                    <Input
                      id={`in-${key}`}
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min={0}
                      className="h-12 text-lg"
                      value={reading[key]}
                      onChange={(e) => setReading(active!, { [key]: e.target.value })}
                      aria-invalid={readingErrors[key] ? true : undefined}
                    />
                  </Field>
                ))}
              </div>

              {live ? (
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <div className="rounded-xl border border-border/70 px-3 py-2">
                    <dt className="text-[11px] text-muted-foreground">{t("live.avg")}</dt>
                    <dd className="font-semibold">
                      {live.avg === null ? "—" : t("mm", { n: Math.round(live.avg * 10) / 10 })}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-border/70 px-3 py-2">
                    <dt className="text-[11px] text-muted-foreground">{t("live.wearPct")}</dt>
                    <dd className="font-semibold">
                      {live.wearPct === null ? "—" : `${Math.round(live.wearPct * 100)}%`}
                    </dd>
                  </div>
                  {(["tread", "pressure", "wear"] as const).map((kind) => (
                    <div key={kind} className="rounded-xl border border-border/70 px-3 py-2">
                      <dt className="text-[11px] text-muted-foreground">{t(`live.${kind}`)}</dt>
                      <dd>
                        {live[kind] ? (
                          <StatusBadge tone={conditionTone(live[kind]!)}>{condition(live[kind]!)}</StatusBadge>
                        ) : (
                          "—"
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              <div className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">{t("f.tyreCondition")}</span>
                <div role="radiogroup" aria-label={t("f.tyreCondition")} className="flex flex-wrap gap-2">
                  {TYRE_CONDITIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={reading.tyreCondition === c}
                      onClick={() => setReading(active!, { tyreCondition: c })}
                      className={cn(
                        "min-h-10 rounded-xl border px-3 text-sm font-medium",
                        reading.tyreCondition === c
                          ? "border-primary bg-primary-soft text-primary"
                          : "border-border/70 hover:bg-surface-2",
                      )}
                    >
                      {t(`tyreCondition.${c}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("f.recommendations")}
                  {!touched[active!] ? ` · ${t("suggested")}` : ""}
                </span>
                <div className="flex flex-wrap gap-2">
                  {recommendations.map((rec) => {
                    const on = recsFor(active!).includes(rec.id);
                    return (
                      <button
                        key={rec.id}
                        type="button"
                        aria-pressed={on}
                        title={rec.description ?? undefined}
                        onClick={() => {
                          const current = recsFor(active!);
                          setReading(active!, {
                            recommendationIds: on ? current.filter((id) => id !== rec.id) : [...current, rec.id],
                          });
                          setTouched((x) => ({ ...x, [active!]: true }));
                        }}
                        className={cn(
                          "min-h-10 rounded-xl border px-3 text-sm font-medium",
                          on ? "border-primary bg-primary-soft text-primary" : "border-border/70 hover:bg-surface-2",
                        )}
                      >
                        {rec.title}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="in-photo" label={t("f.photo")}>
                  <FileUpload
                    id="in-photo"
                    purpose="tyre_photo"
                    value={reading.photoPath}
                    onChange={(url) => setReading(active!, { photoPath: url })}
                  />
                </Field>
                <Field
                  id="in-tyre-remarks"
                  label={reading.tyreCondition === "removed" ? `${t("f.tyreRemarks")} *` : t("f.tyreRemarks")}
                  error={readingErrors.remarks}
                >
                  <Textarea
                    id="in-tyre-remarks"
                    rows={2}
                    value={reading.remarks}
                    onChange={(e) => setReading(active!, { remarks: e.target.value })}
                  />
                </Field>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" size="lg" onClick={() => setStep("review")}>
                  {t("toReview")}
                </Button>
                <Button size="lg" onClick={saveReading}>
                  <CircleCheck />
                  {t("saveReading")}
                </Button>
              </div>
            </div>
          ) : (
            <Alert tone="info">{t("pickTyre")}</Alert>
          )}
        </div>
      ) : null}

      {step === "review" ? (
        <div className="grid gap-4 rounded-2xl border border-border/70 bg-surface p-5">
          <p className="text-sm text-muted-foreground">{t("reviewHint", { done: doneCount, total: fitted.length })}</p>
          <div className="overflow-x-auto rounded-xl border border-border/70">
            <table className="w-full min-w-max text-sm">
              <thead className="bg-surface-2 text-xs text-muted-foreground">
                <tr>
                  {[
                    "position",
                    "tyre",
                    "running",
                    "pressure",
                    "treads",
                    "avg",
                    "tread",
                    "pressureCond",
                    "wear",
                    "recs",
                  ].map((c) => (
                    <th key={c} className="px-3 py-2 text-start font-semibold">
                      {t(`review.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fitted.map((p) => {
                  const r = readings[p.code];
                  const m = metricsOf(p, r);
                  const recs = recommendations.filter((rec) => recsFor(p.code).includes(rec.id));
                  return (
                    <tr
                      key={p.code}
                      className={cn("border-t border-border/50", !isDone(p.code) && "text-muted-foreground")}
                      onClick={() => {
                        setActive(p.code);
                        setStep("tyres");
                      }}
                    >
                      <td className="px-3 py-2 font-mono text-xs font-semibold" dir="ltr">
                        {p.code}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs" dir="ltr">
                        {p.tyre?.serialNo ?? p.tyreSize?.name ?? "—"}
                      </td>
                      <td className="px-3 py-2">{runningOf(p) === null ? "—" : t("km", { n: runningOf(p)! })}</td>
                      <td className="px-3 py-2" dir="ltr">
                        {r?.actualPressurePsi ? `${r.actualPressurePsi} / ${r.recommendedPsi || "—"}` : "—"}
                      </td>
                      <td className="px-3 py-2" dir="ltr">
                        {r?.outer ? `${r.outer} · ${r.center} · ${r.inner}` : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {m.avg === null ? "—" : t("mm", { n: Math.round(m.avg * 10) / 10 })}
                      </td>
                      {(["tread", "pressure", "wear"] as const).map((kind) => (
                        <td key={kind} className="px-3 py-2">
                          {isDone(p.code) && m[kind] ? (
                            <StatusBadge tone={conditionTone(m[kind]!)}>{condition(m[kind]!)}</StatusBadge>
                          ) : (
                            "—"
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-xs">{recs.map((rec) => rec.title).join(", ") || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" size="lg" onClick={() => setStep("tyres")}>
              <ArrowLeft className="rtl:rotate-180" />
              {t("backToTyres")}
            </Button>
            <Button size="lg" onClick={save} disabled={saving || !doneCount}>
              <Save />
              {saving ? tc("saving") : t("saveVisit", { n: doneCount })}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
