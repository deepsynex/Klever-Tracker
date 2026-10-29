"use client";

import { Eye, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/masters/confirm-delete";
import { DataTable } from "@/components/masters/data-table";
import { FormSection, PageHeader, StatusBadge } from "@/components/masters/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { validateRole } from "@/lib/account-management/validation";
import {
  CREATE_ROLE,
  CREATE_ROLE_PERMISSION,
  DELETE_ROLE,
  DELETE_ROLE_PERMISSION,
  ROLES,
  UPDATE_ROLE,
  UPDATE_ROLE_PERMISSION,
  type Module,
  type Role,
  type RolePermission,
  type RolesResult,
} from "@/lib/graphql/account-management";
import { useErrorText, useVmLookups, useVmMutations, useVmQuery } from "@/lib/vehicle-management/use-vm";

const ACTIONS = ["canView", "canAdd", "canEdit", "canDelete"] as const;
type Action = (typeof ACTIONS)[number];
type Flags = Record<Action, boolean>;
const ALL: Flags = { canView: true, canAdd: true, canEdit: true, canDelete: true };

/**
 * A role's effective rights per module. A module with no saved row allows everything (the API
 * is fail-open until a role is configured), so it starts fully ticked.
 */
function effectiveFlags(modules: Module[], saved: RolePermission[]): Record<string, Flags> {
  const byModule = new Map(saved.map((p) => [p.moduleId, p]));
  return Object.fromEntries(
    modules.map((m) => {
      const p = byModule.get(m.id);
      return [m.id, p ? { canView: p.canView, canAdd: p.canAdd, canEdit: p.canEdit, canDelete: p.canDelete } : { ...ALL }];
    }),
  );
}

/** 4. Menu Setting: roles and what each can view, add, edit and delete per module. */
export function RolesScreen() {
  const t = useTranslations("masters.am.roles");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const list = useVmQuery<RolesResult>("am-roles", ROLES);
  const { run, refresh } = useVmMutations();
  const errorText = useErrorText();
  const [editing, setEditing] = useState<Role | "new" | null>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);

  const data = list.data;
  const modules = useMemo(() => [...(data?.modules.data ?? [])].sort((a, b) => Number(a.id) - Number(b.id)), [data]);
  const permsByRole = useMemo(() => {
    const map = new Map<string, RolePermission[]>();
    for (const p of data?.rolePermissions.data ?? []) map.set(p.roleId, [...(map.get(p.roleId) ?? []), p]);
    return map;
  }, [data]);
  // A company's roles, plus platform-wide roles (no company) when viewing all companies.
  const rows = useMemo(
    () =>
      [...(data?.roles.data ?? [])]
        .filter((r) => (r.companyId === null ? lookups.companyId === null : lookups.inScope(r.companyId)))
        .sort((a, b) => Number(a.companyId === null) - Number(b.companyId === null) || a.name.localeCompare(b.name)),
    [data, lookups],
  );
  // Platform-wide roles (no company) and other companies' roles are view only here.
  const own = (r: Role) => r.companyId !== null && r.companyId === lookups.companyId;
  const editable = (r: Role) => own(r) && lookups.allow("core", "edit");

  const access = (r: Role) => {
    const flags = Object.values(effectiveFlags(modules, permsByRole.get(r.id) ?? []));
    const allowed = flags.reduce((n, f) => n + ACTIONS.filter((a) => f[a]).length, 0);
    return allowed === flags.length * ACTIONS.length ? t("fullAccess") : t("partialAccess", { count: flags.filter((f) => f.canView).length, total: flags.length });
  };

  return (
    <div className="grid gap-4">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => setEditing("new")} disabled={!lookups.allow("core", "add") || !list.isSuccess}>
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
        emptyText={t("empty")}
        searchText={(r) => r.name}
        onEdit={lookups.allow("core", "edit") ? (r) => editable(r) && setEditing(r) : undefined}
        onDelete={lookups.allow("core", "delete") ? (r) => own(r) && setDeleting(r) : undefined}
        rowActions={(r) =>
          editable(r) ? null : (
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setEditing(r)} aria-label={t("view")} title={t("view")}>
              <Eye />
            </Button>
          )
        }
        columns={[
          {
            key: "name",
            header: t("f.name"),
            cell: (r) => (
              <span className="inline-flex items-center gap-1.5 font-medium">
                {r.name}
                {r.companyId === null ? <StatusBadge tone="info">{t("platformRole")}</StatusBadge> : null}
              </span>
            ),
          },
          ...(lookups.isPlatform ? [{ key: "account", header: t("account"), cell: (r: Role) => (r.companyId ? lookups.companyName(r.companyId) : "—") }] : []),
          { key: "access", header: t("access"), cell: access },
          {
            key: "status",
            header: tc("status"),
            cell: (r) => <StatusBadge tone={r.status === "active" ? "ok" : "muted"}>{r.status === "active" ? tc("statuses.active") : tc("statuses.inactive")}</StatusBadge>,
          },
        ]}
      />

      {editing !== null && data ? (
        <RoleSheet
          role={editing === "new" ? null : editing}
          readOnly={editing !== "new" && !editable(editing)}
          modules={modules}
          saved={editing === "new" ? [] : (permsByRole.get(editing.id) ?? [])}
          siblings={data.roles.data.filter((r) => r.companyId === lookups.companyId && (editing === "new" || r.id !== editing.id))}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <ConfirmDelete
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting?.name ?? ""}
        failHint={t("deleteInUse")}
        onConfirm={async () => {
          if (!deleting) return;
          await run(DELETE_ROLE, { id: deleting.id });
          // Its permission rows are only removed once the role itself is gone (a role in use stays intact).
          await Promise.all((permsByRole.get(deleting.id) ?? []).map((p) => run(DELETE_ROLE_PERMISSION, { id: p.id }).catch(() => undefined)));
          await refresh();
          toast.success(tc("deleted"));
        }}
      />
    </div>
  );
}

function RoleSheet({
  role,
  readOnly,
  modules,
  saved,
  siblings,
  onClose,
}: {
  role: Role | null;
  readOnly: boolean;
  modules: Module[];
  saved: RolePermission[];
  siblings: Role[];
  onClose: () => void;
}) {
  const t = useTranslations("masters.am.roles");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const { run, refresh, failInto } = useVmMutations();
  const [name, setName] = useState(role?.name ?? "");
  const [status, setStatus] = useState(role?.status ?? "active");
  const [flags, setFlags] = useState(() => effectiveFlags(modules, saved));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const moduleLabel = (m: Module) => (t.has(`moduleNames.${m.code}`) ? t(`moduleNames.${m.code}`) : m.name);
  const setOne = (moduleId: string, action: Action, on: boolean) =>
    setFlags((f) => {
      const row = { ...f[moduleId]!, [action]: on };
      // Adding, editing or deleting needs viewing; no viewing means nothing else either.
      if (on && action !== "canView") row.canView = true;
      if (!on && action === "canView") for (const a of ACTIONS) row[a] = false;
      return { ...f, [moduleId]: row };
    });
  const setRow = (moduleId: string, on: boolean) => setFlags((f) => ({ ...f, [moduleId]: on ? { ...ALL } : { canView: false, canAdd: false, canEdit: false, canDelete: false } }));
  const setColumn = (action: Action, on: boolean) => {
    for (const m of modules) setOne(m.id, action, on);
  };
  const columnAll = (action: Action) => modules.length > 0 && modules.every((m) => flags[m.id]?.[action]);

  const save = async () => {
    const found = validateRole(name, siblings.map((r) => r.name));
    setErrors(found);
    if (Object.keys(found).length) return;
    setPending(true);
    try {
      let roleId = role?.id;
      if (roleId) await run(UPDATE_ROLE, { id: roleId, name: name.trim(), status });
      else roleId = (await run<{ createRole: { id: string } }>(CREATE_ROLE, { companyId: lookups.companyId, name: name.trim(), status })).createRole.id;
      // Every module gets an explicit row, so the role keeps exactly these rights.
      const byModule = new Map(saved.map((p) => [p.moduleId, p]));
      await Promise.all(
        modules.map((m) => {
          const want = flags[m.id]!;
          const have = byModule.get(m.id);
          if (!have) return run(CREATE_ROLE_PERMISSION, { roleId, moduleId: m.id, ...want });
          return ACTIONS.some((a) => have[a] !== want[a]) ? run(UPDATE_ROLE_PERMISSION, { id: have.id, ...want }) : null;
        }),
      );
      await refresh();
      toast.success(tc("saved"));
      onClose();
    } catch (err) {
      failInto(err, setErrors);
      await refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      size="xl"
      title={role ? (readOnly ? role.name : t("editTitle", { name: role.name })) : t("add")}
      description={t("formDescription")}
      footer={
        readOnly ? (
          <Button variant="secondary" onClick={onClose}>
            {tc("close")}
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending ? tc("saving") : tc("save")}
            </Button>
          </>
        )
      }
    >
      <form
        className="grid gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!readOnly) void save();
        }}
      >
        {readOnly ? <Alert tone="info">{role?.companyId === null ? t("platformReadOnly") : t("readOnly")}</Alert> : null}
        <FormSection title={t("sections.role")}>
          <Field id="r-name" label={`${t("f.name")} *`} error={errors.name}>
            <Input id="r-name" value={name} disabled={readOnly} onChange={(e) => setName(e.target.value)} aria-invalid={errors.name ? true : undefined} />
          </Field>
          <Field id="r-status" label={`${tc("status")} *`}>
            <Select id="r-status" value={status} disabled={readOnly} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">{tc("statuses.active")}</option>
              <option value="inactive">{tc("statuses.inactive")}</option>
            </Select>
          </Field>
        </FormSection>

        <fieldset className="grid gap-2" disabled={readOnly}>
          <legend className="mb-1 text-sm font-semibold">{t("sections.permissions")}</legend>
          <p className="-mt-1 text-xs text-subtle">{t("permissionsHint")}</p>
          <div className="relative overflow-x-auto rounded-ctl border border-border">
            <table className="w-full min-w-max border-collapse text-[13px]">
              <caption className="sr-only">{t("sections.permissions")}</caption>
              <thead>
                <tr className="border-b border-border bg-surface-2/60 text-xs text-muted-foreground">
                  <th scope="col" className="px-3 py-2 text-start font-semibold">
                    {t("module")}
                  </th>
                  {ACTIONS.map((a) => (
                    <th key={a} scope="col" className="px-3 py-2 text-center font-semibold">
                      <label className="inline-flex cursor-pointer flex-col items-center gap-1">
                        {t(`actions.${a}`)}
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={columnAll(a)}
                          onChange={(e) => setColumn(a, e.target.checked)}
                          aria-label={t("allIn", { action: t(`actions.${a}`) })}
                        />
                      </label>
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2 text-center font-semibold">
                    {t("all")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {modules.map((m) => {
                  const row = flags[m.id]!;
                  const label = moduleLabel(m);
                  return (
                    <tr key={m.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                      <th scope="row" className="px-3 py-2 text-start font-medium">
                        {label}
                        {t.has(`moduleHints.${m.code}`) ? <span className="block text-xs font-normal text-subtle">{t(`moduleHints.${m.code}`)}</span> : null}
                      </th>
                      {ACTIONS.map((a) => (
                        <td key={a} className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed"
                            checked={row[a]}
                            onChange={(e) => setOne(m.id, a, e.target.checked)}
                            aria-label={`${label}: ${t(`actions.${a}`)}`}
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed"
                          checked={ACTIONS.every((a) => row[a])}
                          onChange={(e) => setRow(m.id, e.target.checked)}
                          aria-label={t("allFor", { module: label })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </fieldset>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
