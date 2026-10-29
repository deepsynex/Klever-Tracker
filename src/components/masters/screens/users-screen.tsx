"use client";

import { Car, Download, IdCard, Plus, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/masters/confirm-delete";
import { DataTable } from "@/components/masters/data-table";
import { downloadSheet } from "@/components/masters/excel";
import { FileUpload } from "@/components/masters/file-upload";
import { FormSection, PageHeader, StatusBadge } from "@/components/masters/page-header";
import { SelectWithAdd, VehicleChecklist } from "@/components/masters/pickers";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { userFormToVariables, userToForm, type UserForm } from "@/lib/account-management/forms";
import { validateUser } from "@/lib/account-management/validation";
import {
  CREATE_DEPARTMENT,
  CREATE_USER,
  DELETE_USER,
  GRANT_USER_DRIVER,
  GRANT_USER_VEHICLE,
  REVOKE_USER_DRIVER,
  REVOKE_USER_VEHICLE,
  UPDATE_USER,
  USERS,
  type AccessGrant,
  type User,
  type UsersResult,
} from "@/lib/graphql/account-management";
import { validateLookupName } from "@/lib/vehicle-management/validation";
import { useErrorText, useVmLookups, useVmMutations, useVmQuery } from "@/lib/vehicle-management/use-vm";

type Grants = Map<string, AccessGrant>;

/** For one user: vehicle/driver id → that user's grant on it. */
function grantsOf(items: Array<{ id: string; userAccess: AccessGrant[] }>, userId: string): Grants {
  const out: Grants = new Map();
  for (const item of items) {
    const grant = item.userAccess.find((g) => g.userId === userId);
    if (grant) out.set(item.id, grant);
  }
  return out;
}

/** Grants and revokes that turn the saved grants into the chosen set. */
async function applyGrants(
  chosen: Set<string>,
  saved: Grants,
  grant: (itemId: string) => Promise<unknown>,
  revoke: (grantId: string) => Promise<unknown>,
) {
  await Promise.all([
    ...[...chosen].filter((id) => !saved.has(id)).map(grant),
    ...[...saved].filter(([id]) => !chosen.has(id)).map(([, g]) => revoke(g.id)),
  ]);
}

/** 2. User: portal logins with their role, department, and the vehicles and drivers they can see. */
export function UsersScreen() {
  const t = useTranslations("masters.am.users");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const list = useVmQuery<UsersResult>("am-users", USERS);
  const { run, refresh, fail } = useVmMutations();
  const errorText = useErrorText();
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [assigning, setAssigning] = useState<{ user: User; kind: "vehicles" | "drivers" } | null>(null);

  const data = list.data;
  const roleName = useMemo(() => new Map((data?.roles.data ?? []).map((r) => [r.id, r.name])), [data]);
  const deptName = useMemo(() => new Map((data?.departments.data ?? []).map((d) => [d.id, d.name])), [data]);
  const rows = useMemo(
    () => [...(data?.users.data ?? [])].filter((u) => lookups.inScope(u.companyId)).sort((a, b) => a.name.localeCompare(b.name)),
    [data, lookups],
  );

  const exportRows = async () => {
    try {
      await downloadSheet(
        [
          [t("f.name"), t("f.address"), t("f.mobile"), t("f.email"), t("f.role"), t("f.department"), t("f.username"), tc("status"), t("f.isAdmin")],
          ...rows.map((u) => [
            u.name,
            u.address ?? "",
            u.mobile ?? "",
            u.email,
            roleName.get(u.roleId) ?? "",
            u.departmentId ? (deptName.get(u.departmentId) ?? "") : "",
            u.username,
            u.status === "active" ? tc("statuses.active") : tc("statuses.inactive"),
            u.isAdmin ? tc("yes") : tc("no"),
          ]),
        ],
        "users.xlsx",
      );
    } catch (err) {
      fail(err);
    }
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
        searchText={(u) => `${u.name} ${u.username} ${u.email}`}
        toolbar={
          <Button variant="secondary" size="sm" onClick={exportRows} disabled={rows.length === 0}>
            <Download />
            {tc("exportExcel")}
          </Button>
        }
        onEdit={lookups.allow("core", "edit") ? setEditing : undefined}
        onDelete={lookups.allow("core", "delete") ? (u) => (u.id === lookups.meId ? toast.error(t("cantDeleteSelf")) : setDeleting(u)) : undefined}
        rowActions={(u) =>
          lookups.allow("core", "edit") ? (
            <>
              <Button variant="ghost" size="icon" className="size-8" onClick={() => setAssigning({ user: u, kind: "vehicles" })} aria-label={t("assignVehicles")} title={t("assignVehicles")}>
                <Car />
              </Button>
              <Button variant="ghost" size="icon" className="size-8" onClick={() => setAssigning({ user: u, kind: "drivers" })} aria-label={t("assignDrivers")} title={t("assignDrivers")}>
                <IdCard />
              </Button>
            </>
          ) : null
        }
        columns={[
          {
            key: "name",
            header: t("f.name"),
            cell: (u) => (
              <span className="inline-flex items-center gap-1.5 font-medium">
                {u.name}
                {u.isAdmin ? <StatusBadge tone="info">{t("admin")}</StatusBadge> : null}
              </span>
            ),
          },
          { key: "address", header: t("f.address"), cell: (u) => u.address ?? "—", className: "max-w-56 truncate" },
          { key: "mobile", header: t("f.mobile"), cell: (u) => <span dir="ltr">{u.mobile ?? "—"}</span> },
          { key: "email", header: t("f.email"), cell: (u) => u.email },
          { key: "role", header: t("f.role"), cell: (u) => roleName.get(u.roleId) ?? `#${u.roleId}` },
          { key: "department", header: t("f.department"), cell: (u) => (u.departmentId ? (deptName.get(u.departmentId) ?? "—") : "—") },
          { key: "username", header: t("f.username"), cell: (u) => <span dir="ltr">{u.username}</span> },
          {
            key: "status",
            header: tc("status"),
            cell: (u) => <StatusBadge tone={u.status === "active" ? "ok" : "muted"}>{u.status === "active" ? tc("statuses.active") : tc("statuses.inactive")}</StatusBadge>,
          },
        ]}
      />

      {editing !== null && data ? (
        <UserSheet user={editing === "new" ? null : editing} data={data} onClose={() => setEditing(null)} />
      ) : null}
      {assigning?.kind === "vehicles" && data ? (
        <AssignVehiclesSheet user={assigning.user} saved={grantsOf(data.vehicles.data, assigning.user.id)} onClose={() => setAssigning(null)} />
      ) : null}
      {assigning?.kind === "drivers" && data ? (
        <AssignDriversSheet user={assigning.user} saved={grantsOf(data.drivers.data, assigning.user.id)} onClose={() => setAssigning(null)} />
      ) : null}

      <ConfirmDelete
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting?.name ?? ""}
        permanent={false}
        onConfirm={async () => {
          if (!deleting) return;
          await run(DELETE_USER, { id: deleting.id });
          await refresh();
          toast.success(tc("deleted"));
        }}
      />
    </div>
  );
}

function UserSheet({ user, data, onClose }: { user: User | null; data: UsersResult; onClose: () => void }) {
  const t = useTranslations("masters.am.users");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const { run, refresh, failInto } = useVmMutations();
  const savedRef = useRef<Record<string, unknown> | null>(user ? userFormToVariables(userToForm(user)) : null);
  const [form, setForm] = useState<UserForm>(() => userToForm(user));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const set = <K extends keyof UserForm>(key: K, value: UserForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const roles = data.roles.data.filter((r) => r.companyId === lookups.companyId && (r.status === "active" || r.id === form.roleId));
  const departments = data.departments.data.filter((d) => d.companyId === lookups.companyId).sort((a, b) => a.name.localeCompare(b.name));

  const save = async () => {
    const others = data.users.data.filter((u) => u.id !== user?.id);
    const found = validateUser(form, { isNew: !user, others });
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error(tc("fixErrors"));
      return;
    }
    setPending(true);
    try {
      const vars = userFormToVariables(form);
      if (user) await run(UPDATE_USER, { id: user.id, ...vars }, { previous: savedRef.current });
      else await run(CREATE_USER, { companyId: lookups.companyId, ...vars });
      await refresh();
      toast.success(tc("saved"));
      onClose();
    } catch (err) {
      failInto(err, setErrors);
    } finally {
      setPending(false);
    }
  };

  const text = (key: keyof UserForm, label: string, opts: { required?: boolean; type?: string; dir?: "ltr"; span?: boolean; hint?: string; autoComplete?: string } = {}) => (
    <div className={opts.span ? "sm:col-span-2" : undefined}>
      <Field id={`u-${key}`} label={opts.required ? `${label} *` : label} error={errors[key]} hint={opts.hint}>
        <Input
          id={`u-${key}`}
          type={opts.type ?? "text"}
          dir={opts.dir}
          autoComplete={opts.autoComplete}
          value={form[key] as string}
          onChange={(e) => set(key, e.target.value as never)}
          aria-invalid={errors[key] ? true : undefined}
        />
      </Field>
    </div>
  );

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      title={user ? t("editTitle", { name: user.name }) : t("add")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? tc("saving") : tc("save")}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-5"
        noValidate
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <FormSection title={t("sections.details")}>
          {text("name", t("f.name"), { required: true })}
          {text("mobile", t("f.mobile"), { type: "tel", dir: "ltr" })}
          {text("email", t("f.email"), { required: true, type: "email", dir: "ltr" })}
          <Field id="u-departmentId" label={t("f.department")} error={errors.departmentId}>
            <SelectWithAdd
              id="u-departmentId"
              value={form.departmentId}
              onChange={(v) => set("departmentId", v)}
              placeholder={tc("none")}
              options={departments.map((d) => ({ id: d.id, label: d.name }))}
              addLabel={t("addDepartment")}
              canAdd={lookups.allow("department", "add")}
              validate={({ name }) => validateLookupName(name, departments)}
              onCreate={async ({ name }) => {
                const res = await run<{ createDepartment: { id: string } }>(CREATE_DEPARTMENT, { companyId: lookups.companyId, name });
                await refresh();
                return res.createDepartment.id;
              }}
            />
          </Field>
          {text("address", t("f.address"), { span: true })}
          <div className="sm:col-span-2">
            <Field id="u-photo" label={t("f.photo")} error={errors.photoPath}>
              <FileUpload id="u-photo" purpose="user_photo" value={form.photoPath} onChange={(url) => set("photoPath", url)} />
            </Field>
          </div>
        </FormSection>

        <FormSection title={t("sections.login")} description={user ? t("passwordKeepHint") : undefined}>
          {text("username", t("f.username"), { required: true, dir: "ltr", autoComplete: "off" })}
          <Field id="u-status" label={`${tc("status")} *`} error={errors.status}>
            <Select id="u-status" value={form.status} onChange={(e) => set("status", e.target.value)}>
              <option value="active">{tc("statuses.active")}</option>
              <option value="inactive">{tc("statuses.inactive")}</option>
            </Select>
          </Field>
          {text("password", user ? t("f.newPassword") : t("f.password"), { required: !user, type: "password", dir: "ltr", autoComplete: "new-password" })}
          {text("confirmPassword", t("f.confirmPassword"), { required: !user, type: "password", dir: "ltr", autoComplete: "new-password" })}
        </FormSection>

        <FormSection title={t("sections.access")}>
          <Field id="u-roleId" label={`${t("f.role")} *`} error={errors.roleId} hint={roles.length === 0 ? t("noRoles") : undefined}>
            <Select id="u-roleId" value={form.roleId} onChange={(e) => set("roleId", e.target.value)} aria-invalid={errors.roleId ? true : undefined}>
              <option value="">{tc("choose")}</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid content-end gap-1 pb-1">
            <Checkbox label={t("f.isAdmin")} checked={form.isAdmin} onChange={(e) => set("isAdmin", e.target.checked)} />
            <p className="text-xs text-subtle">{t("isAdminHint")}</p>
          </div>
        </FormSection>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}

function AssignVehiclesSheet({ user, saved, onClose }: { user: User; saved: Grants; onClose: () => void }) {
  const t = useTranslations("masters.am.users");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const { run, refresh, fail } = useVmMutations();
  const [chosen, setChosen] = useState(() => new Set(saved.keys()));
  const [pending, setPending] = useState(false);

  const save = async () => {
    setPending(true);
    try {
      await applyGrants(
        chosen,
        saved,
        (vehicleId) => run(GRANT_USER_VEHICLE, { userId: user.id, vehicleId }),
        (id) => run(REVOKE_USER_VEHICLE, { id }),
      );
      await refresh();
      toast.success(tc("saved"));
      onClose();
    } catch (err) {
      fail(err);
      await refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      title={t("assignVehiclesTitle", { name: user.name })}
      description={t("assignVehiclesHint")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? tc("saving") : tc("save")}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        {user.isAdmin ? <Alert tone="info">{t("adminSeesAll")}</Alert> : null}
        <VehicleChecklist vehicles={lookups.vehicles} value={chosen} onChange={setChosen} />
      </div>
    </Sheet>
  );
}

function AssignDriversSheet({ user, saved, onClose }: { user: User; saved: Grants; onClose: () => void }) {
  const t = useTranslations("masters.am.users");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const { run, refresh, fail } = useVmMutations();
  const [chosen, setChosen] = useState(() => new Set(saved.keys()));
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);

  const q = query.trim().toLowerCase();
  const available = lookups.drivers.filter((d) => !chosen.has(d.id) && (!q || `${d.name} ${d.mobile} ${d.employeeId ?? ""}`.toLowerCase().includes(q)));
  const assigned = lookups.drivers.filter((d) => chosen.has(d.id));
  const toggle = (id: string, on: boolean) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const save = async () => {
    setPending(true);
    try {
      await applyGrants(
        chosen,
        saved,
        (driverId) => run(GRANT_USER_DRIVER, { userId: user.id, driverId }),
        (id) => run(REVOKE_USER_DRIVER, { id }),
      );
      await refresh();
      toast.success(tc("saved"));
      onClose();
    } catch (err) {
      fail(err);
      await refresh();
    } finally {
      setPending(false);
    }
  };

  const listBox = "grid max-h-80 content-start gap-1 overflow-y-auto rounded-ctl border border-border p-2";

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      title={t("assignDriversTitle", { name: user.name })}
      description={t("assignDriversHint")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? tc("saving") : tc("save")}
          </Button>
        </>
      }
    >
      {lookups.drivers.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t("noDrivers")}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="grid content-start gap-2" aria-labelledby="drv-available">
            <h3 id="drv-available" className="text-sm font-semibold">
              {t("driverList")}
            </h3>
            <div className="relative">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchDrivers")} aria-label={t("searchDrivers")} className="h-8 ps-8" />
            </div>
            <ul className={listBox}>
              {available.length === 0 ? <li className="px-1 py-2 text-[13px] text-muted-foreground">{tc("noMatches")}</li> : null}
              {available.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 rounded px-1 py-1 hover:bg-surface-2">
                  <span className="min-w-0 truncate text-[13px]">
                    {d.name} <span className="text-subtle" dir="ltr">· {d.mobile}</span>
                  </span>
                  <Button variant="secondary" size="sm" onClick={() => toggle(d.id, true)}>
                    <Plus />
                    {tc("add")}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
          <section className="grid content-start gap-2" aria-labelledby="drv-assigned">
            <h3 id="drv-assigned" className="text-sm font-semibold">
              {t("assignedDrivers", { count: assigned.length })}
            </h3>
            <ul className={listBox}>
              {assigned.length === 0 ? <li className="px-1 py-2 text-[13px] text-muted-foreground">{t("noneAssigned")}</li> : null}
              {assigned.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 rounded px-1 py-1 hover:bg-surface-2">
                  <span className="min-w-0 truncate text-[13px]">{d.name}</span>
                  <Button variant="ghost" size="sm" onClick={() => toggle(d.id, false)} className="hover:text-destructive">
                    <X />
                    {tc("remove")}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </Sheet>
  );
}
