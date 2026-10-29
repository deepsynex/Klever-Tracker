"use client";

import { Copy, Plus, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/masters/confirm-delete";
import { DataTable } from "@/components/masters/data-table";
import { PageHeader, StatusBadge } from "@/components/masters/page-header";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import {
  CREATE_SHARED_LOCATION,
  DELETE_SHARED_LOCATION,
  SHARED_LOCATIONS,
  UPDATE_SHARED_LOCATION,
  type SharedLiveLocation,
  type SharedLocationsResult,
} from "@/lib/graphql/vehicle-management";
import {
  companyDateTimeParts,
  companyNowTime,
  companyPartsToUtc,
  companyToday,
  formatDateTime,
  generateShareToken,
  shareLinkState,
  shareUrl,
} from "@/lib/vehicle-management/helpers";
import { useErrorText, useVmLookups, useVmMutations, useVmQuery } from "@/lib/vehicle-management/use-vm";
import { validateShareLink } from "@/lib/vehicle-management/validation";

function origin() {
  return typeof window === "undefined" ? "" : window.location.origin;
}

/** 10. Live Location: time-limited public tracking links for one vehicle. */
export function LiveLocationScreen() {
  const t = useTranslations("masters.vm.liveLocation");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const list = useVmQuery<SharedLocationsResult>("sharedLocations", SHARED_LOCATIONS);
  const { run, refresh } = useVmMutations();
  const errorText = useErrorText();
  const [editing, setEditing] = useState<SharedLiveLocation | "new" | null>(null);
  const [deleting, setDeleting] = useState<SharedLiveLocation | null>(null);
  const rows = useMemo(
    () =>
      [...(list.data?.sharedLiveLocations.data ?? [])]
        .filter((l) => lookups.inScope(lookups.vehicleCompanyId(l.vehicleId)))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [list.data, lookups],
  );

  const copy = async (link: SharedLiveLocation) => {
    try {
      await navigator.clipboard.writeText(shareUrl(origin(), link.shareToken));
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  };
  const share = async (link: SharedLiveLocation) => {
    const url = shareUrl(origin(), link.shareToken);
    if (navigator.share) {
      try {
        await navigator.share({ title: t("shareTitle", { vehicle: lookups.vehicleLabel(link.vehicleId) }), url });
      } catch {
        /* the user closed the share sheet */
      }
    } else await copy(link);
  };

  return (
    <div className="grid gap-4">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => setEditing("new")} disabled={!lookups.allow("sharing", "add") || lookups.vehicles.length === 0}>
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
        emptyText={lookups.vehicles.length === 0 ? t("needVehicles") : t("empty")}
        searchText={(l) => lookups.vehicleLabel(l.vehicleId)}
        rowActions={(l) => (
          <>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => copy(l)} aria-label={t("copy")} title={t("copy")}>
              <Copy />
            </Button>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => share(l)} aria-label={t("share")} title={t("share")}>
              <Share2 />
            </Button>
          </>
        )}
        onEdit={lookups.allow("sharing", "edit") ? setEditing : undefined}
        onDelete={lookups.allow("sharing", "delete") ? setDeleting : undefined}
        columns={[
          { key: "company", header: t("company"), cell: (l) => lookups.companyName(lookups.vehicleCompanyId(l.vehicleId)) },
          { key: "vehicle", header: t("vehicle"), cell: (l) => <span dir="ltr">{lookups.vehicleLabel(l.vehicleId)}</span> },
          { key: "starts", header: t("starts"), cell: (l) => formatDateTime(l.startsAt) },
          { key: "expires", header: t("expires"), cell: (l) => formatDateTime(l.expiresAt) },
          {
            key: "state",
            header: tc("status"),
            cell: (l) => {
              const state = shareLinkState(l.startsAt, l.expiresAt);
              return <StatusBadge tone={state === "active" ? "ok" : state === "scheduled" ? "info" : "muted"}>{t(`states.${state}`)}</StatusBadge>;
            },
          },
          {
            key: "url",
            header: t("url"),
            cell: (l) => (
              <code className="block max-w-72 truncate font-mono text-xs text-muted-foreground" dir="ltr" title={shareUrl(origin(), l.shareToken)}>
                {shareUrl(origin(), l.shareToken)}
              </code>
            ),
          },
        ]}
      />

      {editing !== null ? <ShareSheet link={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}

      <ConfirmDelete
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting ? lookups.vehicleLabel(deleting.vehicleId) : ""}
        onConfirm={async () => {
          if (!deleting) return;
          await run(DELETE_SHARED_LOCATION, { id: deleting.id });
          await refresh();
          toast.success(t("revoked"));
        }}
      />
    </div>
  );
}

function ShareSheet({ link, onClose }: { link: SharedLiveLocation | null; onClose: () => void }) {
  const t = useTranslations("masters.vm.liveLocation");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const { run, refresh, failInto } = useVmMutations();
  const startParts = companyDateTimeParts(link?.startsAt);
  const endParts = companyDateTimeParts(link?.expiresAt);
  const [vehicleId, setVehicleId] = useState(link?.vehicleId ?? "");
  const [startDate, setStartDate] = useState(startParts.date || companyToday());
  const [startTime, setStartTime] = useState(startParts.time || companyNowTime());
  const [endDate, setEndDate] = useState(endParts.date);
  const [endTime, setEndTime] = useState(endParts.time || "23:59");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const save = async () => {
    const startsAt = companyPartsToUtc(startDate, startTime);
    const expiresAt = companyPartsToUtc(endDate, endTime);
    const found = validateShareLink({ vehicleId, endDate, startsAt, expiresAt });
    setErrors(found);
    if (Object.keys(found).length) return;
    setPending(true);
    try {
      if (link) await run(UPDATE_SHARED_LOCATION, { id: link.id, expiresAt });
      else {
        const shareToken = generateShareToken();
        await run(CREATE_SHARED_LOCATION, { vehicleId, shareToken, startsAt, expiresAt });
        try {
          await navigator.clipboard.writeText(shareUrl(origin(), shareToken));
          toast.success(t("createdCopied"));
        } catch {
          toast.success(t("created"));
        }
      }
      if (link) toast.success(tc("saved"));
      await refresh();
      onClose();
    } catch (err) {
      failInto(err, setErrors, { expiresAt: "endDate", startsAt: "endDate" });
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={link ? t("editTitle") : t("add")}
      description={link ? t("editHint") : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? tc("saving") : link ? tc("save") : t("create")}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field id="sl-vehicle" label={`${t("vehicle")} *`} error={errors.vehicleId}>
          <Select id="sl-vehicle" value={vehicleId} disabled={Boolean(link)} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">{tc("choose")}</option>
            {lookups.vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {lookups.vehicleLabel(v.id)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="sl-start" label={t("startDate")}>
            <Input id="sl-start" type="date" value={startDate} disabled={Boolean(link)} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field id="sl-start-time" label={t("startTime")}>
            <Input id="sl-start-time" type="time" value={startTime} disabled={Boolean(link)} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
          <Field id="sl-end" label={`${t("expiryDate")} *`} error={errors.endDate}>
            <Input id="sl-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
          <Field id="sl-end-time" label={t("endTime")}>
            <Input id="sl-end-time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </Field>
        </div>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
