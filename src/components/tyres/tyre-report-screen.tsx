"use client";

import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useSyncExternalStore } from "react";
import { FormSection, PageHeader, StatusBadge } from "@/components/masters/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { formatInCompanyTz, useCompanyTimeZone } from "@/lib/company-time";
import { positionProduct } from "@/lib/graphql/tyre-inspections";
import { readReportVehicle, writeReportVehicle } from "@/lib/tyres/report-selection";
import { tyreMetrics } from "@/lib/tyres/metrics";
import { sinceInspection, whereNow, type SinceInspection } from "@/lib/tyres/report-changes";
import {
  useInspectionVehicle,
  useTyreFitments,
  useTyreInspections,
  useTyreMoves,
  useTyreRemovals,
  useTyreSettings,
} from "@/lib/tyres/use-tyre-api";
import {
  useAxleApi,
  useAxleConfigurations,
  useCustomers,
  useCustomerVehicles,
  useTyreRunningKm,
} from "@/lib/tyres/use-tyres";
import { useVmLookups } from "@/lib/vehicle-management/use-vm";
import { conditionTone, useConditionLabel } from "./conditions";
import { useTyreLabels } from "./tyre-labels";

// The picked vehicle lives in this browser's storage (no query strings): a tiny store over it.
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const pickVehicle = (id: string) => {
  writeReportVehicle(id);
  listeners.forEach((l) => l());
};

const KM = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const CPK = new Intl.NumberFormat("en", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/**
 * Vehicle tyre report (TYRE_MODULE_PLAN.md §8): header cards, condition summary, running vs
 * expected life, current vs expected CPK, the latest inspection, tread profiles, photos and
 * recommendations. Print / Save as PDF with the browser (the app's chrome is hidden in print).
 */
export function TyreReportScreen() {
  const t = useTranslations("masters.tyres.report");
  const tc = useTranslations("masters.common");
  const tv = useTranslations("masters.tyres.axleView");
  const zone = useCompanyTimeZone();
  const lookups = useVmLookups();
  const labels = useTyreLabels();
  const condition = useConditionLabel();
  const { thresholds } = useTyreSettings();
  const customers = useCustomers();
  const vehicles = useCustomerVehicles();
  const axles = useAxleConfigurations();
  const vehicleId = useSyncExternalStore(subscribe, readReportVehicle, () => "");

  const vehicle = useInspectionVehicle(vehicleId || null);
  const fitments = useTyreFitments(Boolean(vehicleId));
  const inspections = useTyreInspections(vehicleId || null, Boolean(vehicleId));
  const v = vehicle.data ?? null;
  const latest = useMemo(
    () => [...(inspections.data ?? [])].sort((a, b) => b.inspectedAt.localeCompare(a.inspectedAt))[0] ?? null,
    [inspections.data],
  );
  const config = (axles.data ?? []).find((a) => a.id === v?.axleConfigurationId) ?? null;
  const customerName = (id: string | null) =>
    (customers.data?.customers?.data ?? []).find((c) => c.id === id)?.name ?? "—";
  const vehicleList = (vehicles.data?.vehicles?.data ?? [])
    .filter((x) => lookups.inScope(x.companyId))
    .sort((a, b) => a.plateNo.localeCompare(b.plateNo));

  // Tyre changes made on the axle drawing after the inspection: removals now; moves once the API logs them.
  const axleApi = useAxleApi();
  const removalsQuery = useTyreRemovals(vehicleId);
  const movesQuery = useTyreMoves(vehicleId, axleApi.planMoves);
  // Each tyre's km now (entered on the vehicle form, grown with the odometer; a new tyre starts from 0).
  const kmNow = useTyreRunningKm(vehicleId, axleApi.runningKm).data;
  const removals = useMemo(() => removalsQuery.data ?? [], [removalsQuery.data]);
  const moves = useMemo(
    () => (axleApi.planMoves ? (movesQuery.data ?? []) : null),
    [axleApi.planMoves, movesQuery.data],
  );
  const changedAfter = latest ? removals.filter((r) => r.removedAt > latest.inspectedAt) : [];
  const movedAfter = latest && moves ? moves.filter((m) => m.movedAt > latest.inspectedAt) : [];
  const readingAt = (code: string) => latest?.items.find((i) => i.positionCode === code) ?? null;

  // Every position with a tyre (serial-numbered or just a size) with the latest reading of the tyre
  // on it now (it follows a moved tyre; a tyre fitted since has none) and its metrics.
  const rows = useMemo(() => {
    if (!v) return [];
    const odometer = latest?.odometerKm ?? v.odometerKm ?? null;
    return [...v.tyrePositions]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .filter((p) => p.fitted || p.tyre)
      .map((p) => {
        const since: SinceInspection = latest
          ? sinceInspection(p.code, latest.inspectedAt, removals, moves)
          : { kind: "same", source: p.code };
        const item =
          since.kind === "same" || since.kind === "moved"
            ? (latest?.items.find((i) => i.positionCode === since.source) ?? null)
            : null;
        const m = tyreMetrics(
          {
            outer: item?.outerTreadMm ?? null,
            center: item?.centerTreadMm ?? null,
            inner: item?.innerTreadMm ?? null,
            actualPressure: item?.actualPressurePsi ?? null,
            recommendedPressure:
              item?.recommendedPressurePsi ?? positionProduct(p).product?.recommendedPressurePsi ?? null,
            originalTread: positionProduct(p).product?.originalTreadDepthMm ?? null,
            price: positionProduct(p).price,
            fitments: p.tyre ? (fitments.data ?? []).filter((f) => f.tyreId === p.tyre!.id) : [],
            currentOdometerKm: odometer,
            // The km at the inspection (it matches the tread read then); else the tyre's km now.
            knownRunningKm:
              item?.runningKm ?? kmNow?.vehicle?.tyrePositions.find((x) => x.code === p.code)?.runningKm ?? null,
          },
          thresholds,
        );
        return { p, item, m, since };
      });
  }, [v, latest, fitments.data, thresholds, removals, moves, kmNow]);
  const anyChange = rows.some((r) => r.since.kind !== "same");
  /** Where each inspected tyre is now (null: taken off since), for the recommendation cards. */
  const now =
    latest && v
      ? whereNow(
          latest.items.map((i) => i.positionCode),
          rows.map((r) => r.p.code),
          latest.inspectedAt,
          removals,
          moves,
        )
      : {};
  const sinceText = (s: SinceInspection) =>
    s.kind === "moved"
      ? t("changes.movedFrom", { code: s.source })
      : s.kind === "new"
        ? t("changes.newTyre")
        : s.kind === "changed"
          ? t("changes.changed")
          : "";

  const count = (kind: "tread" | "pressure" | "wear", value: string) =>
    rows.filter((r) => (r.item?.[`${kind}Condition` as const] ?? r.m[kind]) === value).length;
  const maxLife = Math.max(1, ...rows.flatMap((r) => [r.m.runningKm ?? 0, r.m.expectedLifeKm ?? 0]));
  const maxCpk = Math.max(0.000001, ...rows.flatMap((r) => [r.m.currentCpk ?? 0, r.m.expectedCpk ?? 0]));

  const facts: Array<[string, string]> = v
    ? [
        [t("facts.customer"), v.customer?.name ?? customerName(v.customerId)],
        [t("facts.vehicle"), v.vehicleName ? `${v.plateNo} · ${v.vehicleName}` : v.plateNo],
        [t("facts.axles"), config ? labels.axle(config) : "—"],
        [t("facts.application"), labels.application(v.application)],
        [t("facts.dailyKm"), v.dailyAvgRunningKm === null ? "—" : t("km", { n: KM.format(v.dailyAvgRunningKm) })],
        [
          t("facts.odometer"),
          latest?.odometerKm != null
            ? t("km", { n: KM.format(latest.odometerKm) })
            : v.odometerKm != null
              ? t("km", { n: KM.format(v.odometerKm) })
              : "—",
        ],
        [t("facts.inspected"), latest ? formatInCompanyTz(latest.inspectedAt, zone, "dd-MM-yyyy HH:mm") : "—"],
        [t("facts.inspector"), latest?.inspector?.name ?? "—"],
        [t("facts.tyres"), t("facts.fittedOf", { n: rows.length, total: v.tyrePositions.length })],
      ]
    : [];

  return (
    <div className="grid gap-6 print:gap-4">
      <div className="print:hidden">
        <PageHeader
          title={t("title")}
          description={t("description")}
          actions={
            <Button onClick={() => window.print()} disabled={!v}>
              <Printer />
              {t("print")}
            </Button>
          }
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:w-1/2 print:hidden">
        <Field id="rp-vehicle" label={t("pick")}>
          <Select id="rp-vehicle" value={vehicleId} onChange={(e) => pickVehicle(e.target.value)}>
            <option value="">{tc("choose")}</option>
            {vehicleList.map((x) => (
              <option key={x.id} value={x.id}>
                {`${x.plateNo} · ${customerName(x.customerId)}`}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {!vehicleId ? <Alert tone="info">{t("pickHint")}</Alert> : null}

      {v ? (
        <article className="grid gap-6 print:gap-4" aria-label={t("title")}>
          <header className="hidden items-end justify-between border-b border-border pb-3 print:flex">
            <div>
              <h1 className="text-xl font-bold">{t("title")}</h1>
              <p className="text-sm" dir="ltr">
                {v.plateNo} · {v.customer?.name ?? ""}
              </p>
            </div>
            <p className="text-xs">
              {t("printedOn", {
                date: formatInCompanyTz(
                  new Date().toISOString().slice(0, 19).replace("T", " "),
                  zone,
                  "dd-MM-yyyy HH:mm",
                ),
              })}
            </p>
          </header>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 print:grid-cols-5">
            {facts.map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border/70 bg-surface px-3 py-2 break-inside-avoid">
                <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
                <dd className="text-sm font-semibold">{value}</dd>
              </div>
            ))}
          </dl>

          {/* Condition summary: counts with labels (never colour alone). */}
          <section className="grid gap-3 sm:grid-cols-3 break-inside-avoid">
            {(
              [
                ["tread", ["good", "critical", "needs_replacement"]],
                ["pressure", ["good", "under_inflated", "over_inflated"]],
                ["wear", ["uniform", "outer", "inner", "center", "shoulder"]],
              ] as const
            ).map(([kind, values]) => (
              <div key={kind} className="rounded-2xl border border-border/70 bg-surface p-4">
                <h3 className="mb-2 text-sm font-semibold">{t(`summary.${kind}`)}</h3>
                <ul className="grid gap-1.5">
                  {values.map((value) => (
                    <li key={value} className="flex items-center justify-between gap-2 text-sm">
                      <StatusBadge tone={conditionTone(value)}>{condition(value)}</StatusBadge>
                      <span className="font-semibold tabular-nums">{latest ? count(kind, value) : "—"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          <section className="grid gap-6 lg:grid-cols-2 print:grid-cols-2">
            <BarSection
              title={t("life.title")}
              hint={t("life.hint")}
              rows={rows.map((r) => ({
                key: r.p.code,
                label: r.p.code,
                value: r.m.runningKm,
                target: r.m.expectedLifeKm,
                text:
                  r.m.runningKm === null
                    ? t("noData")
                    : `${KM.format(r.m.runningKm)} / ${r.m.expectedLifeKm === null ? "—" : KM.format(r.m.expectedLifeKm)} km`,
              }))}
              max={maxLife}
              legend={[t("life.running"), t("life.expected")]}
            />
            <BarSection
              title={t("cpk.title")}
              hint={t("cpk.hint")}
              rows={rows.map((r) => ({
                key: r.p.code,
                label: r.p.code,
                value: r.m.currentCpk,
                target: r.m.expectedCpk,
                text:
                  r.m.currentCpk === null
                    ? t("noData")
                    : `${CPK.format(r.m.currentCpk)} / ${r.m.expectedCpk === null ? "—" : CPK.format(r.m.expectedCpk)}`,
              }))}
              max={maxCpk}
              legend={[t("cpk.current"), t("cpk.expected")]}
            />
          </section>

          <FormSection title={t("latest.title")} description={latest ? undefined : t("latest.none")} columns={1}>
            <div className="overflow-x-auto rounded-xl border border-border/70">
              <table className="w-full min-w-max text-sm print:min-w-0 print:text-[10px]">
                <thead className="bg-surface-2 text-xs text-muted-foreground">
                  <tr>
                    {[
                      "position",
                      "tyre",
                      "product",
                      "pressure",
                      "treads",
                      "avg",
                      "wearPct",
                      "tread",
                      "pressureCond",
                      "wear",
                      "tyreCondition",
                    ].map((c) => (
                      <th key={c} className="px-2 py-2 text-start font-semibold">
                        {t(`latest.${c}`)}
                      </th>
                    ))}
                    {anyChange ? <th className="px-2 py-2 text-start font-semibold">{t("changes.column")}</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ p, item, m, since }) => (
                    <tr key={p.code} className="border-t border-border/50">
                      <td className="px-2 py-1.5 font-mono text-xs font-semibold" dir="ltr">
                        {p.code}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-xs" dir="ltr">
                        {p.tyre?.serialNo ?? "—"}
                      </td>
                      <td className="px-2 py-1.5 text-xs" dir="ltr">
                        {positionProduct(p).product?.displayName ?? p.tyreSize?.name ?? "—"}
                      </td>
                      <td className="px-2 py-1.5" dir="ltr">
                        {item?.actualPressurePsi != null
                          ? `${item.actualPressurePsi} / ${item.recommendedPressurePsi ?? "—"}`
                          : "—"}
                      </td>
                      <td className="px-2 py-1.5" dir="ltr">
                        {item
                          ? `${item.outerTreadMm ?? "—"} · ${item.centerTreadMm ?? "—"} · ${item.innerTreadMm ?? "—"}`
                          : "—"}
                      </td>
                      <td className="px-2 py-1.5">
                        {m.avgTread === null ? "—" : t("mm", { n: Math.round(m.avgTread * 10) / 10 })}
                      </td>
                      <td className="px-2 py-1.5">{m.wearPct === null ? "—" : `${Math.round(m.wearPct * 100)}%`}</td>
                      {(["tread", "pressure", "wear"] as const).map((kind) => {
                        const value = item?.[`${kind}Condition` as const] ?? m[kind];
                        return (
                          <td key={kind} className="px-2 py-1.5">
                            {value ? <StatusBadge tone={conditionTone(value)}>{condition(value)}</StatusBadge> : "—"}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 text-xs">
                        {item?.tyreCondition ? t(`tyreCondition.${item.tyreCondition}`) : "—"}
                      </td>
                      {anyChange ? (
                        <td className="px-2 py-1.5 text-xs font-semibold text-primary">{sinceText(since) || "—"}</td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </FormSection>

          {/* Tyre changes made after the inspection, so an old reading isn't taken for the tyre there now. */}
          {latest && (changedAfter.length || movedAfter.length) ? (
            <section className="grid gap-3 break-inside-avoid">
              <div>
                <h3 className="text-sm font-semibold">{t("changes.title")}</h3>
                <p className="text-xs text-subtle">{moves ? t("changes.hint") : t("changes.hintNoMoves")}</p>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2 print:grid-cols-2">
                {[
                  ...changedAfter.map((r) => ({ at: r.removedAt, kind: "removed" as const, r })),
                  ...movedAfter.map((m) => ({ at: m.movedAt, kind: "moved" as const, m })),
                ]
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .map((c) => {
                    if (c.kind === "moved") {
                      return (
                        <li key={`m${c.m.id}`} className="rounded-xl border border-border/70 bg-surface px-3 py-2">
                          <p className="text-sm font-semibold">
                            <span className="font-mono" dir="ltr">
                              {c.m.fromPosition} → {c.m.toPosition}
                            </span>
                            {" · "}
                            {t("changes.moved")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatInCompanyTz(c.m.movedAt, zone, "dd-MM-yyyy HH:mm")}
                            {c.m.user ? ` · ${t("changes.by", { name: c.m.user.name })}` : ""}
                          </p>
                        </li>
                      );
                    }
                    // The reading the removed tyre had at the inspection (it may have moved there since).
                    const was = sinceInspection(c.r.position, latest.inspectedAt, removals, moves, c.r.removedAt);
                    const then = was.kind === "same" || was.kind === "moved" ? readingAt(was.source) : null;
                    return (
                      <li
                        key={`r${c.r.id}`}
                        className="grid gap-1 rounded-xl border border-border/70 bg-surface px-3 py-2"
                      >
                        <p className="text-sm font-semibold">
                          <span className="font-mono" dir="ltr">
                            {c.r.position}
                          </span>
                          {" · "}
                          {t("changes.takenOff", { what: tv(`fate.options.${c.r.disposition}`) })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatInCompanyTz(c.r.removedAt, zone, "dd-MM-yyyy HH:mm")}
                          {c.r.user ? ` · ${t("changes.by", { name: c.r.user.name })}` : ""}
                          {c.r.note ? ` · ${c.r.note}` : ""}
                        </p>
                        {then ? (
                          <p className="flex flex-wrap items-center gap-2 text-xs">
                            <span dir="ltr">
                              {t("changes.readingThen", {
                                treads: `${then.outerTreadMm ?? "—"} · ${then.centerTreadMm ?? "—"} · ${then.innerTreadMm ?? "—"}`,
                              })}
                            </span>
                            {then.treadCondition ? (
                              <StatusBadge tone={conditionTone(then.treadCondition)}>
                                {condition(then.treadCondition)}
                              </StatusBadge>
                            ) : null}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
              </ul>
            </section>
          ) : null}

          {latest ? (
            <section className="grid gap-3">
              <h3 className="text-sm font-semibold">{t("profiles.title")}</h3>
              <p className="-mt-2 text-xs text-subtle">{t("profiles.hint")}</p>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 print:grid-cols-6">
                {rows
                  .filter((r) => r.item)
                  .map(({ p, item, since }) => (
                    <li key={p.code} className="rounded-xl border border-border/70 bg-surface p-2 break-inside-avoid">
                      <p className="font-mono text-xs font-semibold" dir="ltr">
                        {p.code}
                        {since.kind === "moved" ? (
                          <span className="font-sans font-normal text-muted-foreground"> · {sinceText(since)}</span>
                        ) : null}
                      </p>
                      <TreadProfile
                        outer={item!.outerTreadMm}
                        center={item!.centerTreadMm}
                        inner={item!.innerTreadMm}
                        original={positionProduct(p).product?.originalTreadDepthMm ?? null}
                        labels={[t("profiles.outer"), t("profiles.center"), t("profiles.inner")]}
                      />
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}

          {latest && latest.items.some((i) => i.photoPath || i.recommendations.length || i.remarks) ? (
            <section className="grid gap-3">
              <h3 className="text-sm font-semibold">{t("photos.title")}</h3>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3">
                {latest.items
                  .filter((i) => i.photoPath || i.recommendations.length || i.remarks)
                  .map((i) => (
                    <li
                      key={i.id}
                      className="grid gap-2 rounded-xl border border-border/70 bg-surface p-3 break-inside-avoid"
                    >
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold" dir="ltr">
                          {i.positionCode}
                          {i.tyre?.serialNo ? ` · ${i.tyre.serialNo}` : ""}
                        </span>
                        {/* What's been done with this tyre since: taken off, or moved. */}
                        {now[i.positionCode] === null ? (
                          <StatusBadge tone="muted">{t("changes.cardTakenOff")}</StatusBadge>
                        ) : now[i.positionCode] && now[i.positionCode] !== i.positionCode ? (
                          <StatusBadge tone="muted">{t("changes.nowOn", { code: now[i.positionCode]! })}</StatusBadge>
                        ) : null}
                      </p>
                      {i.photoPath ? (
                        // eslint-disable-next-line @next/next/no-img-element -- uploaded photo on the API's host
                        <img
                          src={i.photoPath}
                          alt={t("photos.alt", { code: i.positionCode })}
                          className="aspect-video w-full rounded-lg object-cover"
                        />
                      ) : null}
                      {i.remarks ? <p className="text-sm">{i.remarks}</p> : null}
                      {i.recommendations.map((r) => (
                        <div key={r.id} className="rounded-lg bg-surface-2 px-2 py-1.5">
                          <p className="text-sm font-semibold">{r.title}</p>
                          {r.description ? <p className="text-xs text-muted-foreground">{r.description}</p> : null}
                        </div>
                      ))}
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}
        </article>
      ) : vehicleId && vehicle.isPending ? (
        <div className="h-64 animate-pulse rounded-2xl bg-surface-2" />
      ) : null}
    </div>
  );
}

/**
 * One bar per tyre (the value) with a tick at its target (expected): one hue, a recessive track,
 * direct value labels, and a native tooltip per bar.
 */
function BarSection({
  title,
  hint,
  rows,
  max,
  legend,
}: {
  title: string;
  hint: string;
  rows: Array<{ key: string; label: string; value: number | null; target: number | null; text: string }>;
  max: number;
  legend: [string, string];
}) {
  const ROW = 26;
  const LABEL_W = 46;
  const TEXT_W = 150;
  const W = 520;
  const plotW = W - LABEL_W - TEXT_W;
  return (
    <div className="grid gap-2 rounded-2xl border border-border/70 bg-surface p-4 break-inside-avoid">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-subtle">{hint}</p>
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-5 rounded-[3px] bg-primary" />
          {legend[0]}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-0.5 bg-foreground" />
          {legend[1]}
        </span>
      </div>
      {rows.length ? (
        <svg
          viewBox={`0 0 ${W} ${rows.length * ROW + 4}`}
          className="w-full"
          role="img"
          aria-label={title}
          style={{ direction: "ltr" }}
        >
          {rows.map((r, i) => {
            const y = i * ROW + 4;
            const width = r.value ? Math.max(2, (r.value / max) * plotW) : 0;
            const tick = r.target ? LABEL_W + (r.target / max) * plotW : null;
            return (
              <g key={r.key}>
                <title>{`${r.label}: ${r.text}`}</title>
                <text
                  x={0}
                  y={y + 13}
                  fontSize="11"
                  fontWeight="600"
                  className="fill-foreground"
                  fontFamily="ui-monospace, monospace"
                >
                  {r.label}
                </text>
                <rect x={LABEL_W} y={y + 3} width={plotW} height={14} rx="4" className="fill-surface-2" />
                {width ? (
                  <rect x={LABEL_W} y={y + 3} width={width} height={14} rx="4" className="fill-primary" />
                ) : null}
                {tick !== null ? <rect x={tick - 1} y={y} width={2} height={20} className="fill-foreground" /> : null}
                <text x={LABEL_W + plotW + 8} y={y + 14} fontSize="11" className="fill-muted-foreground">
                  {r.text}
                </text>
              </g>
            );
          })}
        </svg>
      ) : null}
    </div>
  );
}

/** A tyre's three grooves as bars against its original depth, with the critical (6 mm) and replace (3 mm) lines. */
function TreadProfile({
  outer,
  center,
  inner,
  original,
  labels,
}: {
  outer: number | null;
  center: number | null;
  inner: number | null;
  original: number | null;
  labels: [string, string, string];
}) {
  const H = 70;
  const top = Math.max(original ?? 0, outer ?? 0, center ?? 0, inner ?? 0, 8);
  const y = (mm: number) => H - (mm / top) * H;
  const bars: Array<[string, number | null]> = [
    [labels[0], outer],
    [labels[1], center],
    [labels[2], inner],
  ];
  return (
    <svg
      viewBox={`0 0 90 ${H + 14}`}
      className="w-full"
      role="img"
      aria-label={bars.map(([l, v]) => `${l} ${v ?? "—"} mm`).join(", ")}
      style={{ direction: "ltr" }}
    >
      {[6, 3].map((mm) => (
        <g key={mm}>
          <line
            x1={0}
            x2={90}
            y1={y(mm)}
            y2={y(mm)}
            stroke={mm === 3 ? "#dc2626" : "#f59e0b"}
            strokeDasharray="3 2"
            strokeWidth="1"
          />
        </g>
      ))}
      {bars.map(([label, mm], i) => (
        <g key={label}>
          <title>{`${label}: ${mm ?? "—"} mm`}</title>
          {mm !== null ? (
            <rect x={8 + i * 28} y={y(mm)} width={18} height={H - y(mm)} rx="3" className="fill-primary" />
          ) : null}
          <text x={17 + i * 28} y={H + 11} textAnchor="middle" fontSize="8" className="fill-muted-foreground">
            {mm ?? "—"}
          </text>
        </g>
      ))}
    </svg>
  );
}
