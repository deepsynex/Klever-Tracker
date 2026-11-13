"use client";

import { CircleDashed, Hexagon, MapPinned, Plus, RotateCcw, Trash2, Undo2, Waypoints } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/masters/confirm-delete";
import { DataTable } from "@/components/masters/data-table";
import { isDirty, useDiscardGuard } from "@/components/masters/discard-guard";
import { GeofenceMap, type ContextShape, type GeofenceDraft } from "@/components/masters/geofence-map";
import { FilterSelect, FormSection, KpiCards, PageHeader, StatusBadge } from "@/components/masters/page-header";
import { VehicleChecklist } from "@/components/masters/pickers";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { circleRing, closeRing, isValidPolygon, openRing, parseAreaGeoJson, polygonAreaM2, type LatLng } from "@/lib/geofences/geometry";
import {
  CREATE_GEOFENCE,
  CREATE_GEOFENCE_VEHICLE,
  CREATE_GEOFENCE_VEHICLE_GROUP,
  DELETE_GEOFENCE,
  DELETE_GEOFENCE_VEHICLE,
  DELETE_GEOFENCE_VEHICLE_GROUP,
  GEOFENCES,
  UPDATE_GEOFENCE,
  type Geofence,
  type GeofencesResult,
} from "@/lib/graphql/geofences";
import { GROUPS, type GroupsResult } from "@/lib/graphql/vehicle-management";
import { diffMemberships } from "@/lib/vehicle-management/helpers";
import { useErrorText, useVmLookups, useVmMutations, useVmQuery } from "@/lib/vehicle-management/use-vm";
import { cn } from "@/lib/utils";

/** Largest circle the form accepts (100 km): anything bigger is almost certainly a typo. */
const MAX_RADIUS_M = 100_000;
const DEFAULT_RADIUS_M = 150;

/** A geofence's outline as a closed [lng, lat] ring (for context shapes, sizes and the live map), or null. */
export function ringOf(g: Geofence) {
  if (g.type === "circle" && g.centreLat != null && g.centreLng != null && g.radiusM) {
    return circleRing({ lat: g.centreLat, lng: g.centreLng }, g.radiusM, 48);
  }
  const pts = parseAreaGeoJson(g.areaGeoJson);
  return pts.length >= 3 ? closeRing(pts) : null;
}

/** Size for sorting: area in m² (a circle's from its radius). */
function areaM2(g: Geofence): number | null {
  if (g.type === "circle") return g.radiusM ? Math.PI * g.radiusM ** 2 : null;
  const pts = parseAreaGeoJson(g.areaGeoJson);
  return pts.length >= 3 ? polygonAreaM2(pts) : null;
}

/** 7. Geofences: areas that fire enter/exit alerts for the vehicles and groups assigned to them. */
export function GeofencesScreen() {
  const t = useTranslations("masters.vm.geofences");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const list = useVmQuery<GeofencesResult>("geofences", GEOFENCES);
  const groupsQuery = useVmQuery<GroupsResult>("groups", GROUPS);
  const { run, refresh } = useVmMutations();
  const errorText = useErrorText();
  const [editing, setEditing] = useState<Geofence | "new" | null>(null);
  const [deleting, setDeleting] = useState<Geofence | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const all = useMemo(() => (list.data?.geofences.data ?? []).filter((g) => lookups.inScope(g.companyId)), [list.data, lookups]);
  const rows = useMemo(
    () =>
      all
        .filter((g) => typeFilter === "all" || g.type === typeFilter)
        .filter((g) => statusFilter === "all" || (statusFilter === "active") === g.isActive)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [all, typeFilter, statusFilter],
  );
  const groups = useMemo(() => (groupsQuery.data?.vehicleGroups.data ?? []).filter((g) => lookups.inScope(g.companyId)), [groupsQuery.data, lookups]);
  const filtered = typeFilter !== "all" || statusFilter !== "all";

  const typeLabel = (type: string) => (type === "circle" || type === "polygon" || type === "route" ? t(`types.${type}`) : type);
  const sizeText = (g: Geofence) => {
    if (g.type === "circle") return g.radiusM ? t("radiusValue", { m: Math.round(g.radiusM).toLocaleString("en") }) : "—";
    const a = areaM2(g);
    if (a == null) return "—";
    return a >= 1e6 ? t("areaKm", { km: (a / 1e6).toFixed(2) }) : t("areaHa", { ha: (a / 1e4).toFixed(2) });
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => setEditing("new")} disabled={!lookups.allow("geofences", "add")}>
            <Plus />
            {t("add")}
          </Button>
        }
      />
      <KpiCards
        loading={list.isPending}
        items={[
          { key: "total", label: t("kpi.total"), value: all.length, icon: <MapPinned />, tone: "primary" },
          { key: "active", label: t("kpi.active"), value: all.filter((g) => g.isActive).length, icon: <Waypoints />, tone: "ok" },
          { key: "circles", label: t("kpi.circles"), value: all.filter((g) => g.type === "circle").length, icon: <CircleDashed />, tone: "muted" },
          { key: "polygons", label: t("kpi.polygons"), value: all.filter((g) => g.type === "polygon").length, icon: <Hexagon />, tone: "muted" },
        ]}
      />
      <DataTable
        caption={t("title")}
        rows={rows}
        loading={list.isPending}
        error={list.error ? errorText(list.error) : null}
        emptyText={t("empty")}
        searchText={(g) => [g.name, g.address, typeLabel(g.type)].join(" ")}
        filters={
          <>
            <FilterSelect label={t("type")} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">{tc("all")}</option>
              <option value="circle">{t("types.circle")}</option>
              <option value="polygon">{t("types.polygon")}</option>
              <option value="route">{t("types.route")}</option>
            </FilterSelect>
            <FilterSelect label={tc("status")} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">{tc("all")}</option>
              <option value="active">{tc("statuses.active")}</option>
              <option value="inactive">{tc("statuses.inactive")}</option>
            </FilterSelect>
            <Button
              variant="secondary"
              disabled={!filtered}
              onClick={() => {
                setTypeFilter("all");
                setStatusFilter("all");
              }}
            >
              <RotateCcw />
              {tc("reset")}
            </Button>
          </>
        }
        onEdit={lookups.allow("geofences", "edit") ? setEditing : undefined}
        onDelete={lookups.allow("geofences", "delete") ? setDeleting : undefined}
        columns={[
          {
            key: "name",
            header: tc("name"),
            sortValue: (g) => g.name,
            cell: (g) => (
              <span className="grid">
                <span className="font-medium">{g.name}</span>
                {g.address ? <span className="max-w-72 truncate text-xs text-muted-foreground">{g.address}</span> : null}
              </span>
            ),
          },
          {
            key: "type",
            header: t("type"),
            sortValue: (g) => typeLabel(g.type),
            cell: (g) => (
              <span className="inline-flex items-center gap-1.5">
                {g.type === "polygon" ? <Hexagon className="size-3.5 text-primary" aria-hidden /> : g.type === "route" ? <Waypoints className="size-3.5 text-primary" aria-hidden /> : <CircleDashed className="size-3.5 text-primary" aria-hidden />}
                {typeLabel(g.type)}
              </span>
            ),
          },
          { key: "size", header: t("size"), numeric: true, sortValue: (g) => areaM2(g), cell: sizeText },
          { key: "vehicles", header: t("vehicles"), numeric: true, sortValue: (g) => g.vehicleMemberships.length, cell: (g) => g.vehicleMemberships.length },
          { key: "groups", header: t("groups"), numeric: true, sortValue: (g) => g.vehicleGroupMemberships.length, cell: (g) => g.vehicleGroupMemberships.length },
          {
            key: "status",
            header: tc("status"),
            sortValue: (g) => (g.isActive ? 0 : 1),
            cell: (g) => <StatusBadge tone={g.isActive ? "ok" : "muted"}>{g.isActive ? tc("statuses.active") : tc("statuses.inactive")}</StatusBadge>,
          },
        ]}
      />

      {editing !== null ? (
        <GeofenceSheet
          geofence={editing === "new" ? null : editing}
          geofences={all}
          groups={groups.map((g) => ({ id: g.id, name: g.name }))}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <ConfirmDelete
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting?.name ?? ""}
        notice={t("deleteNotice")}
        onConfirm={async () => {
          if (!deleting) return;
          await run(DELETE_GEOFENCE, { id: deleting.id });
          await refresh();
          toast.success(tc("deleted"));
        }}
      />
    </div>
  );
}

type Form = {
  name: string;
  address: string;
  type: "circle" | "polygon";
  isActive: boolean;
  radius: string;
  centre: LatLng | null;
  points: LatLng[];
  vehicles: string[];
  groups: string[];
};

function initialForm(g: Geofence | null): Form {
  const isPolygon = g?.type === "polygon";
  return {
    name: g?.name ?? "",
    address: g?.address ?? "",
    type: isPolygon ? "polygon" : "circle",
    isActive: g?.isActive ?? true,
    radius: g?.radiusM ? String(Math.round(g.radiusM)) : String(DEFAULT_RADIUS_M),
    centre: g && g.centreLat != null && g.centreLng != null ? { lat: g.centreLat, lng: g.centreLng } : null,
    points: isPolygon ? parseAreaGeoJson(g?.areaGeoJson) : [],
    vehicles: [...new Set(g?.vehicleMemberships.map((m) => m.vehicleId) ?? [])].sort(),
    groups: [...new Set(g?.vehicleGroupMemberships.map((m) => m.vehicleGroupId) ?? [])].sort(),
  };
}

function GeofenceSheet({
  geofence,
  geofences,
  groups,
  onClose,
}: {
  geofence: Geofence | null;
  geofences: Geofence[];
  groups: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const t = useTranslations("masters.vm.geofences");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const { run, refresh, failInto } = useVmMutations();
  const [initial] = useState(() => initialForm(geofence));
  const [form, setForm] = useState<Form>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const guard = useDiscardGuard(isDirty(form, initial), onClose);
  // Route geofences need a path the API can't store yet (backend G6): shown, but not editable.
  const isRoute = geofence?.type === "route";
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const radiusM = Number(form.radius);
  const radiusOk = Number.isFinite(radiusM) && radiusM > 0 && radiusM <= MAX_RADIUS_M;
  const draft: GeofenceDraft = { type: form.type, centre: form.centre, radiusM: radiusOk ? radiusM : DEFAULT_RADIUS_M, points: form.points };
  const others: ContextShape[] = useMemo(
    () =>
      geofences
        .filter((g) => g.id !== geofence?.id && g.companyId === (geofence?.companyId ?? lookups.companyId))
        .flatMap((g) => {
          const ring = ringOf(g);
          return ring ? [{ id: g.id, name: g.name, ring }] : [];
        }),
    [geofences, geofence, lookups.companyId],
  );

  const validate = (): Record<string, string> => {
    const found: Record<string, string> = {};
    const name = form.name.trim();
    if (!name) found.name = "required";
    else if (geofences.some((g) => g.id !== geofence?.id && g.companyId === (geofence?.companyId ?? lookups.companyId) && g.name.trim().toLowerCase() === name.toLowerCase())) {
      found.name = "duplicateName";
    }
    if (!form.address.trim()) found.address = "required";
    if (form.type === "circle") {
      if (!form.centre) found.shape = `server:${t("errors.centre")}`;
      if (!radiusOk) found.radius = `server:${t("errors.radius", { max: (MAX_RADIUS_M / 1000).toLocaleString("en") })}`;
    } else if (!isValidPolygon(form.points)) {
      found.shape = `server:${t("errors.polygon")}`;
    }
    return found;
  };

  const save = async () => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;
    setPending(true);
    try {
      const base = { name: form.name.trim(), address: form.address.trim(), type: form.type, isActive: form.isActive };
      const shape =
        form.type === "circle"
          ? { radiusM, centre: form.centre }
          : { radiusM: null, area: openRing(form.points) };
      let id = geofence?.id;
      if (id) {
        await run(UPDATE_GEOFENCE, { id, ...base, ...shape }, { previous: { radiusM: geofence?.radiusM ?? null } });
      } else {
        id = (await run<{ createGeofence: { id: string } }>(CREATE_GEOFENCE, { companyId: lookups.companyId, ...base, ...shape })).createGeofence.id;
      }
      const vehicleDiff = diffMemberships(form.vehicles, geofence?.vehicleMemberships ?? []);
      // diffMemberships works on { id, vehicleId }: the group id goes in the vehicleId slot.
      const groupDiff = diffMemberships(form.groups, (geofence?.vehicleGroupMemberships ?? []).map((m) => ({ id: m.id, vehicleId: m.vehicleGroupId })));
      await Promise.all([
        ...vehicleDiff.add.map((vehicleId) => run(CREATE_GEOFENCE_VEHICLE, { geofenceId: id, vehicleId })),
        ...vehicleDiff.remove.map((membershipId) => run(DELETE_GEOFENCE_VEHICLE, { id: membershipId })),
        ...groupDiff.add.map((vehicleGroupId) => run(CREATE_GEOFENCE_VEHICLE_GROUP, { geofenceId: id, vehicleGroupId })),
        ...groupDiff.remove.map((membershipId) => run(DELETE_GEOFENCE_VEHICLE_GROUP, { id: membershipId })),
      ]);
      await refresh();
      toast.success(tc("saved"));
      onClose();
    } catch (err) {
      failInto(err, setErrors, { centre: "shape", area: "shape", radiusM: "radius" });
      await refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && guard.requestClose()}
      size="xl"
      title={geofence ? t("editTitle", { name: geofence.name }) : t("add")}
      description={t("sheetHint")}
      footer={
        <>
          <Button variant="secondary" onClick={guard.requestClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={save} disabled={pending || isRoute}>
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
        <FormSection title={t("sections.details")}>
          <Field id="gf-name" label={`${tc("name")} *`} error={errors.name}>
            <Input id="gf-name" value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={120} />
          </Field>
          <Field id="gf-address" label={`${t("address")} *`} error={errors.address}>
            <Input id="gf-address" value={form.address} onChange={(e) => set("address", e.target.value)} maxLength={255} />
          </Field>
          <Field id="gf-type" label={t("type")} hint={isRoute ? t("routeReadOnly") : t("routeSoon")}>
            <Select
              id="gf-type"
              value={isRoute ? "route" : form.type}
              disabled={isRoute}
              onChange={(e) => {
                const type = e.target.value as Form["type"];
                setErrors((x) => ({ ...x, shape: "" }));
                set("type", type);
              }}
            >
              <option value="circle">{t("types.circle")}</option>
              <option value="polygon">{t("types.polygon")}</option>
              <option value="route" disabled>
                {t("types.route")} ({t("comingSoon")})
              </option>
            </Select>
          </Field>
          <div className="flex items-end pb-2">
            <Checkbox label={t("activeLabel")} checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} />
          </div>
        </FormSection>

        {!isRoute ? (
          <FormSection title={t("sections.area")} columns={1}>
            <p className="-mt-1 text-xs text-muted-foreground">{form.type === "circle" ? t("circleHint") : t("polygonHint")}</p>
            <GeofenceMap
              draft={draft}
              others={others}
              label={t("mapLabel")}
              unavailable={t("mapUnavailable")}
              onChange={(next) =>
                setForm((f) => ({
                  ...f,
                  centre: next.centre,
                  points: next.points,
                  radius: next.radiusM !== draft.radiusM ? String(next.radiusM) : f.radius,
                }))
              }
            />
            {errors.shape ? <p className={cn("text-xs font-medium text-destructive")}>{errors.shape.replace(/^server:/, "")}</p> : null}
            <div className="flex flex-wrap items-end gap-3">
              {form.type === "circle" ? (
                <div className="w-48">
                  <Field id="gf-radius" label={t("radius")} error={errors.radius}>
                    <Input id="gf-radius" inputMode="numeric" dir="ltr" value={form.radius} onChange={(e) => set("radius", e.target.value.replace(/[^\d.]/g, ""))} />
                  </Field>
                </div>
              ) : (
                <>
                  <span className="text-sm text-muted-foreground">{t("pointCount", { count: form.points.length })}</span>
                  <Button variant="secondary" size="sm" disabled={form.points.length === 0} onClick={() => set("points", form.points.slice(0, -1))}>
                    <Undo2 />
                    {t("undoPoint")}
                  </Button>
                  <Button variant="ghost" size="sm" className="hover:text-destructive" disabled={form.points.length === 0} onClick={() => set("points", [])}>
                    <Trash2 />
                    {t("clearPoints")}
                  </Button>
                </>
              )}
              {form.type === "circle" && form.centre ? (
                <span className="pb-2 font-mono text-xs text-muted-foreground" dir="ltr">
                  {form.centre.lat.toFixed(6)}, {form.centre.lng.toFixed(6)}
                </span>
              ) : null}
            </div>
          </FormSection>
        ) : null}

        <FormSection title={t("sections.vehicles")} description={t("vehiclesHint")} columns={1}>
          <VehicleChecklist vehicles={lookups.vehicles} value={new Set(form.vehicles)} onChange={(ids) => set("vehicles", [...ids].sort())} />
        </FormSection>
        <FormSection title={t("sections.groups")} columns={1}>
          {groups.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{t("noGroups")}</p>
          ) : (
            <div className="grid max-h-48 gap-1.5 overflow-y-auto rounded-ctl border border-border p-2 sm:grid-cols-2">
              {groups.map((g) => (
                <Checkbox
                  key={g.id}
                  label={g.name}
                  checked={form.groups.includes(g.id)}
                  onChange={(e) => set("groups", e.target.checked ? [...form.groups, g.id].sort() : form.groups.filter((x) => x !== g.id))}
                />
              ))}
            </div>
          )}
        </FormSection>
        <button type="submit" hidden />
      </form>
      {guard.dialog}
    </Sheet>
  );
}
