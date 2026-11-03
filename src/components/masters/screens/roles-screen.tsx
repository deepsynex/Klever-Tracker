"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { isDirty, useDiscardGuard } from "@/components/masters/discard-guard";
import { FormSection } from "@/components/masters/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { MAX_LENGTH, validateRole } from "@/lib/account-management/validation";
import {
  CREATE_ROLE,
  CREATE_ROLE_PERMISSION,
  ROLES,
  UPDATE_ROLE,
  UPDATE_ROLE_PERMISSION,
  type Module,
  type Role,
  type RolePermission,
  type RolesResult,
} from "@/lib/graphql/account-management";
import { errorLabel, useErrorText, useVmLookups, useVmMutations, useVmQuery } from "@/lib/vehicle-management/use-vm";

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
      return [
        m.id,
        p ? { canView: p.canView, canAdd: p.canAdd, canEdit: p.canEdit, canDelete: p.canDelete } : { ...ALL },
      ];
    }),
  );
}

/**
 * The permission drawer for one role, opened from elsewhere (the users list's role action).
 * `notice` explains the context.
 */
export function RolePermissionsSheet({
  roleId,
  notice,
  onClose,
}: {
  roleId: string;
  notice?: ReactNode;
  onClose: () => void;
}) {
  const lookups = useVmLookups();
  const list = useVmQuery<RolesResult>("am-roles", ROLES);
  const errorText = useErrorText();
  const data = list.data;
  const role = data?.roles.data.find((r) => r.id === roleId) ?? null;

  if (list.error) return <Alert tone="error">{errorText(list.error)}</Alert>;
  // Still loading, or the role is gone (deleted since the list loaded): nothing to show.
  if (!data || !lookups.isSuccess || !role) return null;
  const modules = [...data.modules.data].sort((a, b) => Number(a.id) - Number(b.id));
  const editable = role.companyId !== null && role.companyId === lookups.companyId && lookups.allow("core", "edit");
  return (
    <RoleSheet
      role={role}
      readOnly={!editable}
      modules={modules}
      saved={data.rolePermissions.data.filter((p) => p.roleId === role.id)}
      siblings={data.roles.data.filter((r) => r.companyId === lookups.companyId && r.id !== role.id)}
      notice={notice}
      onClose={onClose}
    />
  );
}

function RoleSheet({
  role,
  readOnly,
  modules,
  saved,
  siblings,
  notice,
  onClose,
}: {
  role: Role | null;
  readOnly: boolean;
  modules: Module[];
  saved: RolePermission[];
  siblings: Role[];
  notice?: ReactNode;
  onClose: () => void;
}) {
  const t = useTranslations("masters.am.roles");
  const tc = useTranslations("masters.common");
  const tv = useTranslations("validation");
  const lookups = useVmLookups();
  const { run, refresh, failInto } = useVmMutations();
  const [name, setName] = useState(role?.name ?? "");
  const [status, setStatus] = useState(role?.status ?? "active");
  const [flags, setFlags] = useState(() => effectiveFlags(modules, saved));
  const [initial] = useState(() => ({
    name: role?.name ?? "",
    status: role?.status ?? "active",
    flags: effectiveFlags(modules, saved),
  }));
  const guard = useDiscardGuard(!readOnly && isDirty({ name, status, flags }, initial), onClose);
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
  const setRow = (moduleId: string, on: boolean) =>
    setFlags((f) => ({
      ...f,
      [moduleId]: on ? { ...ALL } : { canView: false, canAdd: false, canEdit: false, canDelete: false },
    }));
  const setColumn = (action: Action, on: boolean) => {
    for (const m of modules) setOne(m.id, action, on);
  };
  const columnAll = (action: Action) => modules.length > 0 && modules.every((m) => flags[m.id]?.[action]);

  const save = async () => {
    // A role must be allowed to see at least one module.
    const found = validateRole(
      name,
      siblings.map((r) => r.name),
      Object.values(flags).some((f) => f.canView),
    );
    setErrors(found);
    if (Object.keys(found).length) return;
    setPending(true);
    try {
      let roleId = role?.id;
      if (roleId) await run(UPDATE_ROLE, { id: roleId, name: name.trim(), status });
      else
        roleId = (
          await run<{ createRole: { id: string } }>(CREATE_ROLE, {
            companyId: lookups.companyId,
            name: name.trim(),
            status,
          })
        ).createRole.id;
      // Every module gets an explicit row, so the role keeps exactly these rights.
      const byModule = new Map(saved.map((p) => [p.moduleId, p]));
      await Promise.all(
        modules.map((m) => {
          const want = flags[m.id]!;
          const have = byModule.get(m.id);
          if (!have) return run(CREATE_ROLE_PERMISSION, { roleId, moduleId: m.id, ...want });
          return ACTIONS.some((a) => have[a] !== want[a])
            ? run(UPDATE_ROLE_PERMISSION, { id: have.id, ...want })
            : null;
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
      onOpenChange={(open) => !open && guard.requestClose()}
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
            <Button variant="secondary" onClick={guard.requestClose}>
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
        {notice ? <Alert tone="warning">{notice}</Alert> : null}
        {readOnly ? (
          <Alert tone="info">{role?.companyId === null ? t("platformReadOnly") : t("readOnly")}</Alert>
        ) : null}
        <FormSection title={t("sections.role")}>
          <Field id="r-name" label={`${t("f.name")} *`} error={errors.name}>
            <Input
              id="r-name"
              maxLength={MAX_LENGTH.name}
              value={name}
              disabled={readOnly}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={errors.name ? true : undefined}
            />
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
          {errors.permissions ? <Alert tone="error">{errorLabel(tv, errors.permissions)}</Alert> : null}
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
                        {t.has(`moduleHints.${m.code}`) ? (
                          <span className="block text-xs font-normal text-subtle">{t(`moduleHints.${m.code}`)}</span>
                        ) : null}
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
      {guard.dialog}
    </Sheet>
  );
}
