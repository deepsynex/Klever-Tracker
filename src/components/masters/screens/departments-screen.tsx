"use client";

import { Building, FolderOpen, Plus, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/masters/confirm-delete";
import { DataTable } from "@/components/masters/data-table";
import { KpiCards, PageHeader } from "@/components/masters/page-header";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { formatInCompanyTz, useCompanyTimeZone } from "@/lib/company-time";
import {
  CREATE_DEPARTMENT,
  DELETE_DEPARTMENT,
  DEPARTMENTS,
  UPDATE_DEPARTMENT,
  type DepartmentsResult,
} from "@/lib/graphql/account-management";
import {
  serverFieldErrors,
  useErrorText,
  useVmLookups,
  useVmMutations,
  useVmQuery,
} from "@/lib/vehicle-management/use-vm";
import { validateLookupName } from "@/lib/vehicle-management/validation";

type Row = DepartmentsResult["departments"]["data"][number] & { users: number };

/**
 * Departments: an internal grouping of users (API Doc §6.17). Deleting one keeps its users;
 * their department is simply cleared (the API's nullOnDelete), which the confirmation says.
 */
export function DepartmentsScreen() {
  const t = useTranslations("masters.am.departments");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const zone = useCompanyTimeZone();
  const list = useVmQuery<DepartmentsResult>("am-departments", DEPARTMENTS);
  const { run, refresh, fail } = useVmMutations();
  const errorText = useErrorText();

  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  const rows: Row[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const u of list.data?.users.data ?? [])
      if (u.departmentId) counts.set(u.departmentId, (counts.get(u.departmentId) ?? 0) + 1);
    return (list.data?.departments.data ?? [])
      .filter((d) => lookups.inScope(d.companyId))
      .map((d) => ({ ...d, users: counts.get(d.id) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [list.data, lookups]);

  const openForm = (row: Row | "new") => {
    setEditing(row);
    setNameError(undefined);
    setName(row === "new" ? "" : row.name);
  };

  const save = async () => {
    // Names are unique per company, case-insensitively (same rule the API enforces).
    const siblings = rows.map((r) => ({ id: r.id, name: r.name }));
    const found = validateLookupName(name, siblings, editing === "new" ? undefined : editing?.id);
    setNameError(found.name);
    if (found.name || !lookups.companyId) return;
    setPending(true);
    try {
      if (editing === "new") await run(CREATE_DEPARTMENT, { companyId: lookups.companyId, name: name.trim() });
      else if (editing) await run(UPDATE_DEPARTMENT, { id: editing.id, name: name.trim() });
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
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => openForm("new")} disabled={!lookups.allow("department", "add")}>
            <Plus />
            {t("add")}
          </Button>
        }
      />
      <KpiCards
        loading={list.isPending}
        items={[
          { key: "total", label: t("kpi.total"), value: rows.length, icon: <Building />, tone: "primary" },
          { key: "users", label: t("kpi.users"), value: rows.reduce((n, r) => n + r.users, 0), icon: <Users />, tone: "ok" },
          { key: "empty", label: t("kpi.empty"), value: rows.filter((r) => r.users === 0).length, icon: <FolderOpen />, tone: "warn" },
        ]}
      />
      <DataTable
        caption={t("title")}
        rows={rows}
        loading={list.isPending}
        error={list.error ? errorText(list.error) : null}
        emptyText={t("empty")}
        searchText={(r) => r.name}
        columns={[
          { key: "name", header: tc("name"), sortValue: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
          { key: "users", header: t("users"), sortValue: (r) => r.users, cell: (r) => <span dir="ltr">{r.users}</span> },
          ...(lookups.isPlatform
            ? [{ key: "company", header: t("company"), sortValue: (r: Row) => lookups.companyName(r.companyId), cell: (r: Row) => lookups.companyName(r.companyId) }]
            : []),
          {
            key: "created",
            header: t("created"),
            sortValue: (r) => r.createdAt,
            cell: (r) => (
              <span dir="ltr" className="whitespace-nowrap">
                {formatInCompanyTz(r.createdAt, zone, "dd-MM-yyyy")}
              </span>
            ),
          },
        ]}
        onEdit={lookups.allow("department", "edit") ? openForm : undefined}
        onDelete={lookups.allow("department", "delete") ? setDeleting : undefined}
      />

      <Sheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === "new" ? t("add") : t("edit")}
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
          <Field id="dept-name" label={`${tc("name")} *`} error={nameError}>
            <Input id="dept-name" value={name} maxLength={255} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <button type="submit" hidden />
        </form>
      </Sheet>

      <ConfirmDelete
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting?.name ?? ""}
        notice={deleting && deleting.users > 0 ? t("usersKept", { n: deleting.users }) : undefined}
        onConfirm={async () => {
          if (!deleting) return;
          await run(DELETE_DEPARTMENT, { id: deleting.id });
          await refresh();
          toast.success(tc("deleted"));
        }}
      />
    </div>
  );
}
