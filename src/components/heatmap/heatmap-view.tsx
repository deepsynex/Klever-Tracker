"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Flame, Loader2, MapPinOff } from "lucide-react";
import dynamic from "next/dynamic";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { gqlRequest } from "@/lib/graphql/client";
import { GET_DEVICES, GET_VEHICLES, type DevicesResult, type VehiclesResult } from "@/lib/graphql/operations";
import { WEIGHT_MODES, gridZoomLevel, type WeightMode } from "@/lib/heatmap/aggregate";
import { GRADIENTS, HeatmapRequestError, fetchHeatmap, heatmapUrl, type HeatmapQuery } from "@/lib/heatmap/client";
import { parseHeatmapQuery } from "@/lib/heatmap/request";
import { buildTrackTargets, companyTimeToUtcIso } from "@/lib/history/selection";
import { cn } from "@/lib/utils";
import { HeatmapToolbar, type ToolbarState } from "./heatmap-toolbar";
import { VehicleMultiSelect } from "./vehicle-multi-select";

const HeatmapMap = dynamic(() => import("./heatmap-map"), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-surface-2" />,
});

const DEFAULT_ZOOM = 11;
const ZOOM_DEBOUNCE_MS = 500;

type Submitted = Omit<HeatmapQuery, "zoom"> & { id: number };

/** `today` is the company-time-zone date ("2026-10-29"), passed from the server at request time. */
export function HeatmapView({ today }: { today: string }) {
  const t = useTranslations("heatmap");
  const te = useTranslations("errors");
  const format = useFormatter();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  // Filters. Dates and times are in the company time zone (Asia/Dubai).
  const [selected, setSelected] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState(today);
  const [fromTime, setFromTime] = useState("00:00");
  const [toDate, setToDate] = useState(today);
  const [toTime, setToTime] = useState("23:59");
  const [mode, setMode] = useState<WeightMode>("dwell");
  const [formErrors, setFormErrors] = useState<Record<string, string[]>>({});

  const [submitted, setSubmitted] = useState<Submitted | null>(null);
  const [runId, setRunId] = useState(0);
  const [gridZoom, setGridZoom] = useState(gridZoomLevel(DEFAULT_ZOOM));
  const zoomTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [toolbar, setToolbar] = useState<ToolbarState>({
    visible: true,
    gradient: "greenRed",
    opacity: 0.8,
    radius: 30,
  });

  const targetsQuery = useQuery({
    queryKey: ["heatmap", "targets"],
    queryFn: async () => {
      const [v, d] = await Promise.all([
        gqlRequest<VehiclesResult>(GET_VEHICLES, { first: 100 }),
        gqlRequest<DevicesResult>(GET_DEVICES, { first: 100 }),
      ]);
      // A device fitted to a listed vehicle is already covered by that vehicle.
      const vehicleIds = new Set(v.vehicles.data.map((x) => x.id));
      return buildTrackTargets(v.vehicles.data, d.devices.data).filter(
        (x) => x.kind === "vehicle" || !x.vehicleId || !vehicleIds.has(x.vehicleId),
      );
    },
  });
  const targets = useMemo(() => targetsQuery.data ?? [], [targetsQuery.data]);

  const heatmap = useQuery({
    queryKey: ["heatmap", "cells", submitted, gridZoom],
    queryFn: ({ signal }) => fetchHeatmap({ ...submitted!, zoom: gridZoom }, signal),
    enabled: submitted !== null,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const data = submitted ? heatmap.data : undefined;
  const ready = !!data && !heatmap.isPlaceholderData;
  const fitKey = submitted === null ? runId : ready ? submitted.id : -1;

  // Re-fetch only when the zoom lands on a different grid size, after the user stops zooming.
  const onZoomChange = (zoom: number) => {
    clearTimeout(zoomTimer.current);
    zoomTimer.current = setTimeout(() => setGridZoom(gridZoomLevel(zoom)), ZOOM_DEBOUNCE_MS);
  };

  const onShow = (e: FormEvent) => {
    e.preventDefault();
    const picked = targets.filter((x) => selected.includes(x.key));
    const query: Omit<HeatmapQuery, "zoom"> = {
      vehicleIds: picked.filter((x) => x.kind === "vehicle").map((x) => x.id),
      deviceIds: picked.filter((x) => x.kind === "device").map((x) => x.id),
      from: companyTimeToUtcIso(fromDate, fromTime),
      to: companyTimeToUtcIso(toDate, toTime, 59),
      mode,
    };
    // Same rules as the server, so most mistakes show without a round trip.
    const check = parseHeatmapQuery(new URL(heatmapUrl({ ...query, zoom: gridZoom }), "http://x").searchParams);
    if (!check.ok) {
      setFormErrors(check.errors);
      return;
    }
    setFormErrors({});
    setRunId(runId + 1);
    setSubmitted({ ...query, id: runId + 1 });
  };

  const onClear = () => {
    setSelected([]);
    setFormErrors({});
    setSubmitted(null);
    setRunId(runId + 1);
  };

  const serverErrors =
    heatmap.error instanceof HeatmapRequestError && heatmap.error.status === 422
      ? heatmap.error.body?.errors
      : undefined;
  const fieldErrors = { ...serverErrors, ...formErrors };
  const errorFor = (field: string) => fieldErrors[field]?.map((key) => t(`errors.${key}`)).join(" ");
  const requestError =
    heatmap.error && !serverErrors
      ? heatmap.error instanceof HeatmapRequestError && heatmap.error.status !== 0
        ? te(heatmap.error.body?.kind ?? "unknown")
        : te("network")
      : null;

  const mapStyle = useMemo(
    () => ({
      visible: toolbar.visible,
      colorRange: GRADIENTS[toolbar.gradient],
      opacity: toolbar.opacity,
      radius: toolbar.radius,
    }),
    [toolbar],
  );

  const loading = heatmap.isFetching;
  const noData = ready && data.cell_count === 0;

  return (
    <div className="grid gap-4">
      <header className="flex items-center gap-2">
        <Flame aria-hidden className="size-5 text-primary" />
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="text-xs text-subtle">{t("subtitle")}</p>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="content-start">
          <CardTitle>{t("filters.title")}</CardTitle>
          <form className="grid gap-3" onSubmit={onShow} noValidate>
            {/* Company picker for platform staff waits on a cross-company scope in the API (A1). */}
            <div className="grid gap-1.5">
              <Label>{t("filters.vehicles")}</Label>
              {targetsQuery.isPending ? (
                <p className="text-xs text-subtle">{t("filters.loadingVehicles")}</p>
              ) : targetsQuery.isError ? (
                <Alert tone="error">{te("unknown")}</Alert>
              ) : targets.length === 0 ? (
                <p className="text-xs text-subtle">{t("filters.noVehicles")}</p>
              ) : (
                <VehicleMultiSelect
                  targets={targets}
                  selected={selected}
                  onChange={setSelected}
                  invalid={!!(errorFor("vehicle_ids") || errorFor("device_ids"))}
                />
              )}
              <FieldError message={errorFor("vehicle_ids") ?? errorFor("device_ids")} />
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
              <DateTimeField
                id="hm-from-date"
                label={t("filters.fromDate")}
                type="date"
                value={fromDate}
                onChange={setFromDate}
              />
              <DateTimeField
                id="hm-from-time"
                label={t("filters.fromTime")}
                type="time"
                value={fromTime}
                onChange={setFromTime}
              />
              <DateTimeField
                id="hm-to-date"
                label={t("filters.toDate")}
                type="date"
                value={toDate}
                onChange={setToDate}
              />
              <DateTimeField
                id="hm-to-time"
                label={t("filters.toTime")}
                type="time"
                value={toTime}
                onChange={setToTime}
              />
            </div>
            <FieldError message={[errorFor("from"), errorFor("to")].filter(Boolean).join(" ") || undefined} />

            <div className="grid gap-1.5">
              <Label htmlFor="hm-mode">{t("filters.weightMode")}</Label>
              <Select id="hm-mode" value={mode} onChange={(e) => setMode(e.target.value as WeightMode)}>
                {WEIGHT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {t(`modes.${m}.label`)}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-subtle">{t(`modes.${mode}.hint`)}</p>
            </div>

            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={loading || targets.length === 0}>
                {loading && <Loader2 aria-hidden className="animate-spin" />}
                {loading ? t("filters.loading") : t("filters.show")}
              </Button>
              <Button type="button" variant="secondary" onClick={onClear}>
                {t("filters.clear")}
              </Button>
            </div>
            {requestError && <Alert tone="error">{requestError}</Alert>}
          </form>
        </Card>

        <div className="grid min-w-0 content-start gap-3">
          {data && (
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-live="polite">
              <Stat label={t("summary.points")} value={format.number(data.total_points)} />
              <Stat label={t("summary.cells")} value={format.number(data.cell_count)} />
              <Stat
                className="col-span-2"
                label={t("summary.range")}
                value={format.dateTimeRange(new Date(data.from), new Date(data.to), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              />
            </dl>
          )}
          {data && (data.truncated || data.dropped_points > 0) && (
            <p className="text-xs text-subtle">
              {data.truncated && t("summary.truncated", { count: data.cell_count })}{" "}
              {data.dropped_points > 0 && t("summary.dropped", { count: data.dropped_points })}
            </p>
          )}

          <div className="relative h-[min(70dvh,680px)] min-h-[420px] overflow-hidden rounded-card border border-border bg-surface-2">
            {apiKey ? (
              <HeatmapMap
                apiKey={apiKey}
                cells={data?.cells ?? []}
                bounds={data?.bounds ?? null}
                fitKey={fitKey}
                style={mapStyle}
                onZoomChange={onZoomChange}
              />
            ) : (
              <div className="grid size-full place-items-center p-6">
                <Alert tone="warning" className="max-w-md">
                  {t("map.noApiKey")}
                </Alert>
              </div>
            )}

            <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-start">
              <div className="pointer-events-auto">
                <HeatmapToolbar value={toolbar} onChange={setToolbar} />
              </div>
            </div>

            {loading && (
              <div className="absolute inset-0 grid place-items-center bg-background/40" role="status">
                <span className="flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-sm shadow">
                  <Loader2 aria-hidden className="size-4 animate-spin text-primary" />
                  {t("map.loading")}
                </span>
              </div>
            )}
            {noData && !loading && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <span
                  className="flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-sm shadow"
                  role="status"
                >
                  <MapPinOff aria-hidden className="size-4 text-subtle" />
                  {t("map.noData")}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DateTimeField(props: {
  id: string;
  label: string;
  type: "date" | "time";
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={props.id} className="text-xs">
        {props.label}
      </Label>
      <Input
        id={props.id}
        type={props.type}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        required
      />
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("rounded-card border border-border bg-surface px-3 py-2", className)}>
      <dt className="text-[11px] text-subtle">{label}</dt>
      <dd className="truncate font-mono text-sm font-semibold tabular-nums" dir="ltr">
        {value}
      </dd>
    </div>
  );
}
