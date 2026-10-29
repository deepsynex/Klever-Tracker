"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/masters/confirm-delete";
import { DataTable } from "@/components/masters/data-table";
import { PageHeader, StatusBadge } from "@/components/masters/page-header";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { LOOKUP_OPS, type LookupItem, type LookupKind } from "@/lib/graphql/vehicle-management";
import type { PermissionModule } from "@/lib/permissions";
import { serverFieldErrors, useErrorText, useVmLookups, useVmMutations, useVmQuery } from "@/lib/vehicle-management/use-vm";
import { validateLookupName } from "@/lib/vehicle-management/validation";
import { cn } from "@/lib/utils";

const KINDS: LookupKind[] = ["vehicleType", "maintenanceType", "serviceType"];

/** Dropdown masters: Vehicle Types, Maintenance Types and Service Types, one tab each. */
export function TypesScreen() {
  const t = useTranslations("masters.vm.types");
  const [kind, setKind] = useState<LookupKind>("vehicleType");

  return (
    <div className="grid gap-4">
      <PageHeader title={t("title")} description={t("description")} />
      <div role="tablist" aria-label={t("title")} className="flex flex-wrap gap-1 border-b border-border">
        {KINDS.map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-[13px] font-medium",
              kind === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`kinds.${k}`)}
          </button>
        ))}
      </div>
      <LookupList key={kind} kind={kind} />
    </div>
  );
}

function LookupList({ kind }: { kind: LookupKind }) {
  const t = useTranslations("masters.vm.types");
  const tc = useTranslations("masters.common");
  const ops = LOOKUP_OPS[kind];
  // Vehicle types belong to Vehicles; maintenance and service types to Maintenance.
  const perm: PermissionModule = kind === "vehicleType" ? "vehicles" : "maintenance";
  const lookups = useVmLookups();
  const list = useVmQuery<Record<string, { data: LookupItem[] }>>(ops.listField, ops.list);
  const { run, refresh, fail } = useVmMutations();
  const errorText = useErrorText();

  const [editing, setEditing] = useState<LookupItem | "new" | null>(null);
  const [deleting, setDeleting] = useState<LookupItem | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [status, setStatus] = useState("active");
  const [pending, setPending] = useState(false);

  const rows = [...(list.data?.[ops.listField]?.data ?? [])].filter((x) => lookups.inScope(x.companyId)).sort((a, b) => a.name.localeCompare(b.name));

  const openForm = (row: LookupItem | "new") => {
    setEditing(row);
    setNameError(undefined);
    setName(row === "new" ? "" : row.name);
    setStatus(row === "new" ? "active" : row.status);
  };

  const save = async () => {
    const found = validateLookupName(name, rows, editing === "new" ? undefined : editing?.id);
    setNameError(found.name);
    if (found.name || !lookups.companyId) return;
    setPending(true);
    try {
      if (editing === "new") await run(ops.create, { companyId: lookups.companyId, name: name.trim(), status });
      else if (editing) await run(ops.update, { id: editing.id, name: name.trim(), status });
      await refresh();
      toast.success(tc("saved"));
      setEditing(null);
    } catch (err) {
      setNameError(serverFieldErrors(err)?.name);
      fail(err);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <DataTable
        caption={t(`kinds.${kind}`)}
        rows={rows}
        loading={list.isPending}
        error={list.error ? errorText(list.error) : null}
        searchText={(r) => r.name}
        toolbar={
          <Button size="sm" onClick={() => openForm("new")} disabled={!lookups.allow(perm, "add")}>
            <Plus />
            {t(`add.${kind}`)}
          </Button>
        }
        columns={[
          { key: "name", header: tc("name"), cell: (r) => <span className="font-medium">{r.name}</span> },
          {
            key: "status",
            header: tc("status"),
            cell: (r) => <StatusBadge tone={r.status === "active" ? "ok" : "muted"}>{tc(`statuses.${r.status}`)}</StatusBadge>,
          },
        ]}
        onEdit={lookups.allow(perm, "edit") ? openForm : undefined}
        onDelete={lookups.allow(perm, "delete") ? setDeleting : undefined}
      />

      <Sheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === "new" ? t(`add.${kind}`) : t(`edit.${kind}`)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {tc("cancel")}
            </Button>
            <Button onClick={save} disabled={pending || !name.trim()}>
              {pending ? tc("saving") : tc("save")}
            </Button>
          </>
        }
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field id="type-name" label={`${tc("name")} *`} error={nameError}>
            <Input id="type-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field id="type-status" label={tc("status")} hint={t("inactiveHint")}>
            <Select id="type-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">{tc("statuses.active")}</option>
              <option value="inactive">{tc("statuses.inactive")}</option>
            </Select>
          </Field>
          <button type="submit" hidden />
        </form>
      </Sheet>

      <ConfirmDelete
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting?.name ?? ""}
        failHint={t("inUse")}
        onConfirm={async () => {
          if (!deleting) return;
          await run(ops.remove, { id: deleting.id });
          await refresh();
          toast.success(tc("deleted"));
        }}
      />
    </>
  );
}
