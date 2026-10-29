"use client";

import { CornerDownRight, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/masters/confirm-delete";
import { DataTable } from "@/components/masters/data-table";
import { FormSection, PageHeader } from "@/components/masters/page-header";
import { VehicleChecklist } from "@/components/masters/pickers";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import {
  CREATE_GROUP,
  CREATE_GROUP_MEMBER,
  DELETE_GROUP,
  DELETE_GROUP_MEMBER,
  GROUPS,
  UPDATE_GROUP,
  type GroupsResult,
  type VehicleGroup,
} from "@/lib/graphql/vehicle-management";
import { diffMemberships, textOrNull } from "@/lib/vehicle-management/helpers";
import { useErrorText, useVmLookups, useVmMutations, useVmQuery } from "@/lib/vehicle-management/use-vm";
import { validateGroup } from "@/lib/vehicle-management/validation";

/** Groups in tree order (parent, then its sub groups), each with its depth. */
function treeOrder(groups: VehicleGroup[]) {
  const children = new Map<string | null, VehicleGroup[]>();
  for (const g of groups) {
    const parent = g.parentId && groups.some((x) => x.id === g.parentId) ? g.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), g]);
  }
  const out: Array<VehicleGroup & { depth: number }> = [];
  const walk = (parent: string | null, depth: number) => {
    for (const g of (children.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
      out.push({ ...g, depth });
      walk(g.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Ids of a group and everything under it (a group can't be moved under its own sub group). */
function descendants(groups: VehicleGroup[], id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const g of groups) {
      if (g.parentId && out.has(g.parentId) && !out.has(g.id)) {
        out.add(g.id);
        grew = true;
      }
    }
  }
  return out;
}

/** 6 & 7. Group and Sub Group: one VehicleGroup tree (a sub group just has a parent). */
export function GroupsScreen() {
  const t = useTranslations("masters.vm.groups");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const list = useVmQuery<GroupsResult>("groups", GROUPS);
  const { run, refresh } = useVmMutations();
  const errorText = useErrorText();
  const [editing, setEditing] = useState<VehicleGroup | "new" | "newSub" | null>(null);
  const [deleting, setDeleting] = useState<VehicleGroup | null>(null);

  const groups = useMemo(() => (list.data?.vehicleGroups.data ?? []).filter((g) => lookups.inScope(g.companyId)), [list.data, lookups]);
  const rows = useMemo(() => treeOrder(groups), [groups]);
  const nameOf = (id: string | null) => (id ? (groups.find((g) => g.id === id)?.name ?? "—") : "—");

  return (
    <div className="grid gap-4">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditing("newSub")} disabled={!lookups.allow("vehicle-groups", "add") || groups.length === 0}>
              <Plus />
              {t("addSub")}
            </Button>
            <Button onClick={() => setEditing("new")} disabled={!lookups.allow("vehicle-groups", "add")}>
              <Plus />
              {t("add")}
            </Button>
          </>
        }
      />
      <DataTable
        caption={t("title")}
        rows={rows}
        loading={list.isPending}
        error={list.error ? errorText(list.error) : null}
        emptyText={t("empty")}
        searchText={(g) => [g.name, g.inchargeName, g.inchargeEmail, nameOf(g.parentId)].join(" ")}
        onEdit={lookups.allow("vehicle-groups", "edit") ? setEditing : undefined}
        onDelete={lookups.allow("vehicle-groups", "delete") ? setDeleting : undefined}
        columns={[
          {
            key: "name",
            header: tc("name"),
            cell: (g) => (
              <span className="inline-flex items-center gap-1.5 font-medium" style={{ paddingInlineStart: `${g.depth * 1.25}rem` }}>
                {g.depth > 0 ? <CornerDownRight className="size-3.5 text-subtle rtl:-scale-x-100" aria-hidden /> : null}
                {g.name}
              </span>
            ),
          },
          { key: "parent", header: t("parent"), cell: (g) => nameOf(g.parentId) },
          { key: "incharge", header: t("incharge"), cell: (g) => g.inchargeName ?? "—" },
          { key: "email", header: t("email"), cell: (g) => <span dir="ltr">{g.inchargeEmail ?? "—"}</span> },
          { key: "vehicles", header: t("vehicles"), numeric: true, cell: (g) => g.members.length },
        ]}
      />

      {editing !== null ? (
        <GroupSheet
          group={typeof editing === "string" ? null : editing}
          asSub={editing === "newSub"}
          groups={groups}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <ConfirmDelete
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting?.name ?? ""}
        failHint={t("deleteFail")}
        onConfirm={async () => {
          if (!deleting) return;
          await run(DELETE_GROUP, { id: deleting.id });
          await refresh();
          toast.success(tc("deleted"));
        }}
      />
    </div>
  );
}

function GroupSheet({ group, asSub, groups, onClose }: { group: VehicleGroup | null; asSub: boolean; groups: VehicleGroup[]; onClose: () => void }) {
  const t = useTranslations("masters.vm.groups");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const { run, refresh, failInto } = useVmMutations();
  const [name, setName] = useState(group?.name ?? "");
  const [parentId, setParentId] = useState(group?.parentId ?? "");
  const [inchargeName, setInchargeName] = useState(group?.inchargeName ?? "");
  const [inchargeEmail, setInchargeEmail] = useState(group?.inchargeEmail ?? "");
  const [vehicles, setVehicles] = useState(() => new Set(group?.members.map((m) => m.vehicleId) ?? []));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const blocked = group ? descendants(groups, group.id) : new Set<string>();
  const sub = asSub || Boolean(group?.parentId);

  const save = async () => {
    const found = validateGroup({ name, parentId, isSub: sub, inchargeEmail }, groups, group?.id);
    setErrors(found);
    if (Object.keys(found).length) return;
    setPending(true);
    try {
      const vars = { parentId: parentId || null, name: name.trim(), inchargeName: textOrNull(inchargeName), inchargeEmail: textOrNull(inchargeEmail) };
      let id = group?.id;
      if (id) await run(UPDATE_GROUP, { id, ...vars });
      else id = (await run<{ createVehicleGroup: { id: string } }>(CREATE_GROUP, { companyId: lookups.companyId, ...vars })).createVehicleGroup.id;
      const diff = diffMemberships(vehicles, group?.members ?? []);
      await Promise.all([
        ...diff.add.map((vehicleId) => run(CREATE_GROUP_MEMBER, { vehicleGroupId: id, vehicleId })),
        ...diff.remove.map((memberId) => run(DELETE_GROUP_MEMBER, { id: memberId })),
      ]);
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
      size="lg"
      title={group ? t("editTitle", { name: group.name }) : sub ? t("addSub") : t("add")}
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
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <FormSection title={t("sections.details")}>
          <Field id="g-parent" label={sub ? `${t("parent")} *` : t("parent")} error={errors.parentId} hint={sub ? undefined : t("parentHint")}>
            <Select id="g-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">{t("noParent")}</option>
              {treeOrder(groups)
                .filter((g) => !blocked.has(g.id))
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {"— ".repeat(g.depth)}
                    {g.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field id="g-name" label={`${sub ? t("subName") : t("name")} *`} error={errors.name}>
            <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field id="g-incharge" label={t("incharge")}>
            <Input id="g-incharge" value={inchargeName} onChange={(e) => setInchargeName(e.target.value)} />
          </Field>
          <Field id="g-email" label={t("email")} error={errors.inchargeEmail}>
            <Input id="g-email" type="email" dir="ltr" value={inchargeEmail} onChange={(e) => setInchargeEmail(e.target.value)} />
          </Field>
        </FormSection>
        <FormSection title={t("vehicles")} columns={1}>
          <VehicleChecklist vehicles={lookups.vehicles} value={vehicles} onChange={setVehicles} />
        </FormSection>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
