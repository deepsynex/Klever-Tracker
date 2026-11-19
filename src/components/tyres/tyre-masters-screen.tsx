"use client";

import { CircleCheck, Disc3, Lightbulb, Package, Pencil, Plus, Ruler, RotateCcw, Tag, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/masters/confirm-delete";
import { DataTable, RowAction } from "@/components/masters/data-table";
import { isDirty, useDiscardGuard } from "@/components/masters/discard-guard";
import { FilterSelect, FormSection, KpiCards, PageHeader, StatusBadge } from "@/components/masters/page-header";
import { SelectWithAdd } from "@/components/masters/pickers";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  CREATE_TYRE_PRODUCT,
  CREATE_TYRE_RECOMMENDATION,
  DELETE_TYRE_PRODUCT,
  DELETE_TYRE_RECOMMENDATION,
  TYRE_NAMED_OPS,
  UPDATE_TYRE_PRODUCT,
  UPDATE_TYRE_RECOMMENDATION,
  type TyreNamed,
  type TyreNamedKind,
  type TyreProduct,
  type TyreRecommendation,
} from "@/lib/graphql/tyres";
import { useTyreMasters } from "@/lib/tyres/use-tyres";
import { codeFromTitle, validateRecommendation, validateTyreProduct } from "@/lib/tyres/validation";
import { intOrNull, numberOrNull, numText, textOrNull } from "@/lib/vehicle-management/helpers";
import { useErrorText, useVmLookups, useVmMutations } from "@/lib/vehicle-management/use-vm";
import { validateLookupName } from "@/lib/vehicle-management/validation";
import { cn } from "@/lib/utils";

type Tab = "products" | "sizes" | "brands" | "recommendations";
const TABS: Tab[] = ["products", "sizes", "brands", "recommendations"];

/** Shared data for every tab: one request, filtered to the company being worked in. */
function useMasters() {
  const lookups = useVmLookups();
  const query = useTyreMasters();
  const data = useMemo(() => {
    const d = query.data;
    const scoped = <T extends { companyId: string }>(rows: T[] | undefined) =>
      (rows ?? []).filter((r) => lookups.inScope(r.companyId));
    const byName = <T extends { name: string }>(a: T, b: T) =>
      a.name.localeCompare(b.name, undefined, { numeric: true });
    const sizes = scoped(d?.tyreSizes?.data).sort(byName);
    const brands = scoped(d?.tyreBrands?.data).sort(byName);
    const products = scoped(d?.tyreProducts?.data).sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, { numeric: true }),
    );
    const recommendations = scoped(d?.tyreRecommendations?.data).sort((a, b) => a.code.localeCompare(b.code));
    return { sizes, brands, products, recommendations };
  }, [query.data, lookups]);
  return { ...data, isPending: query.isPending, error: query.error, lookups };
}

/** Tyre masters: the catalogue later phases pick from (sizes, brands, products) and the inspection recommendations. */
export function TyreMastersScreen() {
  const t = useTranslations("masters.tyres.masters");
  const [tab, setTab] = useState<Tab>("products");
  const m = useMasters();

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <KpiCards
        loading={m.isPending}
        items={[
          { key: "products", label: t("tabs.products"), value: m.products.length, icon: <Package />, tone: "primary" },
          { key: "sizes", label: t("tabs.sizes"), value: m.sizes.length, icon: <Ruler />, tone: "muted" },
          { key: "brands", label: t("tabs.brands"), value: m.brands.length, icon: <Tag />, tone: "muted" },
          {
            key: "recommendations",
            label: t("tabs.recommendations"),
            value: m.recommendations.length,
            icon: <Lightbulb />,
            tone: "muted",
          },
        ]}
      />
      <div role="tablist" aria-label={t("title")} className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-[13px] font-medium",
              tab === k
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`tabs.${k}`)}
          </button>
        ))}
      </div>
      {tab === "products" ? (
        <ProductsTab />
      ) : tab === "recommendations" ? (
        <RecommendationsTab />
      ) : (
        <NamedTab key={tab} kind={tab === "sizes" ? "size" : "brand"} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Sizes and brands
// ---------------------------------------------------------------------------------------------

function NamedTab({ kind }: { kind: TyreNamedKind }) {
  const t = useTranslations("masters.tyres.masters");
  const tc = useTranslations("masters.common");
  const m = useMasters();
  const { run, refresh, failInto } = useVmMutations();
  const errorText = useErrorText();
  const ops = TYRE_NAMED_OPS[kind];
  const rows = kind === "size" ? m.sizes : m.brands;
  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of m.products) {
      const id = kind === "size" ? p.tyreSizeId : p.tyreBrandId;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [m.products, kind]);

  const [editing, setEditing] = useState<TyreNamed | "new" | null>(null);
  const [deleting, setDeleting] = useState<TyreNamed | null>(null);
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const openForm = (row: TyreNamed | "new") => {
    setEditing(row);
    setErrors({});
    setName(row === "new" ? "" : row.name);
  };

  const save = async () => {
    const found = validateLookupName(name, rows, editing === "new" ? undefined : editing?.id);
    setErrors(found);
    if (found.name || !m.lookups.companyId) return;
    setPending(true);
    try {
      if (editing === "new") await run(ops.create, { companyId: m.lookups.companyId, name: name.trim() });
      else if (editing) await run(ops.update, { id: editing.id, name: name.trim() });
      await refresh();
      toast.success(tc("saved"));
      setEditing(null);
    } catch (err) {
      failInto(err, setErrors);
    } finally {
      setPending(false);
    }
  };

  const canEdit = m.lookups.allow("tyres", "edit");
  const canDelete = m.lookups.allow("tyres", "delete");

  return (
    <>
      <DataTable
        caption={t(`tabs.${kind}s`)}
        rows={rows}
        loading={m.isPending}
        error={m.error ? errorText(m.error) : null}
        searchText={(r) => r.name}
        toolbar={
          <Button onClick={() => openForm("new")} disabled={!m.lookups.allow("tyres", "add")}>
            <Plus />
            {t(`add.${kind}`)}
          </Button>
        }
        columns={[
          {
            key: "name",
            header: tc("name"),
            sortValue: (r) => r.name,
            cell: (r) => (
              <span className="font-medium" dir="ltr">
                {r.name}
              </span>
            ),
          },
          {
            key: "products",
            header: t("usedBy"),
            numeric: true,
            sortValue: (r) => usage.get(r.id) ?? 0,
            cell: (r) => usage.get(r.id) ?? 0,
          },
        ]}
        rowActions={
          canEdit || canDelete
            ? (r) => {
                const used = usage.get(r.id) ?? 0;
                return (
                  <>
                    {canEdit ? (
                      <RowAction label={tc("edit")} onClick={() => openForm(r)}>
                        <Pencil />
                      </RowAction>
                    ) : null}
                    {/* A size or brand a product uses can't be deleted: no delete offered for it. */}
                    {canDelete && used === 0 ? (
                      <RowAction label={tc("delete")} onClick={() => setDeleting(r)} danger>
                        <Trash2 />
                      </RowAction>
                    ) : null}
                  </>
                );
              }
            : undefined
        }
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
          <Field
            id="tm-name"
            label={`${tc("name")} *`}
            error={errors.name}
            hint={kind === "size" ? t("sizeHint") : undefined}
          >
            <Input id="tm-name" dir="ltr" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <button type="submit" hidden />
        </form>
      </Sheet>

      <ConfirmDelete
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting?.name ?? ""}
        failHint={t(`inUse.${kind}`)}
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

// ---------------------------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------------------------

type ProductForm = Record<
  | "tyreSizeId"
  | "tyreBrandId"
  | "pattern"
  | "plyRating"
  | "loadSpeedIndex"
  | "recommendedPressurePsi"
  | "originalTreadDepthMm"
  | "status",
  string
>;

function productToForm(p: TyreProduct | null): ProductForm {
  if (!p)
    return {
      tyreSizeId: "",
      tyreBrandId: "",
      pattern: "",
      plyRating: "",
      loadSpeedIndex: "",
      recommendedPressurePsi: "",
      originalTreadDepthMm: "",
      status: "active",
    };
  return {
    tyreSizeId: p.tyreSizeId,
    tyreBrandId: p.tyreBrandId,
    pattern: p.pattern ?? "",
    plyRating: numText(p.plyRating),
    loadSpeedIndex: p.loadSpeedIndex ?? "",
    recommendedPressurePsi: numText(p.recommendedPressurePsi),
    originalTreadDepthMm: numText(p.originalTreadDepthMm),
    status: p.status,
  };
}

function productToVariables(f: ProductForm): Record<string, unknown> {
  return {
    tyreSizeId: f.tyreSizeId,
    tyreBrandId: f.tyreBrandId,
    pattern: textOrNull(f.pattern),
    plyRating: intOrNull(f.plyRating),
    loadSpeedIndex: textOrNull(f.loadSpeedIndex),
    recommendedPressurePsi: numberOrNull(f.recommendedPressurePsi),
    originalTreadDepthMm: numberOrNull(f.originalTreadDepthMm),
    status: f.status,
  };
}

function ProductsTab() {
  const t = useTranslations("masters.tyres.masters");
  const tc = useTranslations("masters.common");
  const m = useMasters();
  const { run, refresh } = useVmMutations();
  const errorText = useErrorText();
  const [sizeFilter, setSizeFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editing, setEditing] = useState<TyreProduct | "new" | null>(null);
  const [deleting, setDeleting] = useState<TyreProduct | null>(null);

  const sizeName = new Map(m.sizes.map((s) => [s.id, s.name]));
  const brandName = new Map(m.brands.map((b) => [b.id, b.name]));
  const rows = m.products.filter(
    (p) =>
      (!sizeFilter || p.tyreSizeId === sizeFilter) &&
      (!brandFilter || p.tyreBrandId === brandFilter) &&
      (!statusFilter || p.status === statusFilter),
  );
  const num = (v: number | null, unit?: string) => (v === null ? "—" : unit ? `${v} ${unit}` : String(v));

  return (
    <>
      <DataTable
        caption={t("tabs.products")}
        rows={rows}
        loading={m.isPending}
        error={m.error ? errorText(m.error) : null}
        searchText={(p) => [p.displayName, p.pattern, p.loadSpeedIndex].filter(Boolean).join(" ")}
        toolbar={
          <Button onClick={() => setEditing("new")} disabled={!m.lookups.allow("tyres", "add")}>
            <Plus />
            {t("add.product")}
          </Button>
        }
        filters={
          <>
            <FilterSelect label={t("f.size")} value={sizeFilter} onChange={(e) => setSizeFilter(e.target.value)}>
              <option value="">{tc("all")}</option>
              {m.sizes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label={t("f.brand")} value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}>
              <option value="">{tc("all")}</option>
              {m.brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label={tc("status")} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">{tc("all")}</option>
              <option value="active">{tc("statuses.active")}</option>
              <option value="inactive">{tc("statuses.inactive")}</option>
            </FilterSelect>
            <Button
              variant="secondary"
              disabled={!sizeFilter && !brandFilter && !statusFilter}
              onClick={() => {
                setSizeFilter("");
                setBrandFilter("");
                setStatusFilter("");
              }}
            >
              <RotateCcw />
              {tc("reset")}
            </Button>
          </>
        }
        columns={[
          {
            key: "product",
            header: t("f.product"),
            sortValue: (p) => p.displayName,
            cell: (p) => (
              <span className="flex items-center gap-2 font-medium" dir="ltr">
                <Disc3 className="size-4 shrink-0 text-primary" aria-hidden />
                {p.displayName}
              </span>
            ),
          },
          {
            key: "size",
            header: t("f.size"),
            sortValue: (p) => sizeName.get(p.tyreSizeId) ?? "",
            cell: (p) => <span dir="ltr">{sizeName.get(p.tyreSizeId) ?? "—"}</span>,
          },
          {
            key: "brand",
            header: t("f.brand"),
            sortValue: (p) => brandName.get(p.tyreBrandId) ?? "",
            cell: (p) => brandName.get(p.tyreBrandId) ?? "—",
          },
          { key: "pattern", header: t("f.pattern"), sortValue: (p) => p.pattern ?? "", cell: (p) => p.pattern ?? "—" },
          {
            key: "ply",
            header: t("f.plyRating"),
            numeric: true,
            sortValue: (p) => p.plyRating,
            cell: (p) => num(p.plyRating),
          },
          {
            key: "index",
            header: t("f.loadSpeedIndex"),
            sortValue: (p) => p.loadSpeedIndex ?? "",
            cell: (p) => <span dir="ltr">{p.loadSpeedIndex ?? "—"}</span>,
          },
          {
            key: "psi",
            header: t("f.pressure"),
            numeric: true,
            sortValue: (p) => p.recommendedPressurePsi,
            cell: (p) => <span dir="ltr">{num(p.recommendedPressurePsi, "psi")}</span>,
          },
          {
            key: "tread",
            header: t("f.tread"),
            numeric: true,
            sortValue: (p) => p.originalTreadDepthMm,
            cell: (p) => num(p.originalTreadDepthMm, t("mm")),
          },
          {
            key: "status",
            header: tc("status"),
            sortValue: (p) => p.status,
            cell: (p) => (
              <StatusBadge tone={p.status === "active" ? "ok" : "muted"}>{tc(`statuses.${p.status}`)}</StatusBadge>
            ),
          },
        ]}
        onEdit={m.lookups.allow("tyres", "edit") ? setEditing : undefined}
        onDelete={m.lookups.allow("tyres", "delete") ? setDeleting : undefined}
      />

      {editing !== null ? (
        <ProductSheet product={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      ) : null}

      <ConfirmDelete
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting?.displayName ?? ""}
        failHint={t("inUse.product")}
        onConfirm={async () => {
          if (!deleting) return;
          await run(DELETE_TYRE_PRODUCT, { id: deleting.id });
          await refresh();
          toast.success(tc("deleted"));
        }}
      />
    </>
  );
}

function ProductSheet({ product, onClose }: { product: TyreProduct | null; onClose: () => void }) {
  const t = useTranslations("masters.tyres.masters");
  const tc = useTranslations("masters.common");
  const m = useMasters();
  const { run, refresh, failInto } = useVmMutations();
  const [saved] = useState(() => productToForm(product));
  const [form, setForm] = useState(saved);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const guard = useDiscardGuard(isDirty(form, saved), onClose);
  const set = (key: keyof ProductForm, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    const found = validateTyreProduct(form);
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error(tc("fixErrors"));
      return;
    }
    if (!m.lookups.companyId) return;
    setPending(true);
    try {
      const vars = productToVariables(form);
      if (product) await run(UPDATE_TYRE_PRODUCT, { id: product.id, ...vars }, { previous: productToVariables(saved) });
      else await run(CREATE_TYRE_PRODUCT, { companyId: m.lookups.companyId, ...vars });
      await refresh();
      toast.success(tc("saved"));
      onClose();
    } catch (err) {
      failInto(err, setErrors);
    } finally {
      setPending(false);
    }
  };

  const text = (key: keyof ProductForm, label: string, opts: { type?: string; dir?: "ltr"; hint?: ReactNode } = {}) => (
    <Field id={`tp-${key}`} label={label} error={errors[key]} hint={opts.hint}>
      <Input
        id={`tp-${key}`}
        type={opts.type ?? "text"}
        step={opts.type === "number" ? "any" : undefined}
        inputMode={opts.type === "number" ? "decimal" : undefined}
        min={opts.type === "number" ? 0 : undefined}
        dir={opts.dir}
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        aria-invalid={errors[key] ? true : undefined}
      />
    </Field>
  );

  /** A size or brand typed in from the product form ("+" next to the dropdown). */
  const named = (kind: TyreNamedKind, key: "tyreSizeId" | "tyreBrandId", rows: TyreNamed[]) => (
    <Field id={`tp-${key}`} label={`${t(kind === "size" ? "f.size" : "f.brand")} *`} error={errors[key]}>
      <SelectWithAdd
        id={`tp-${key}`}
        value={form[key]}
        onChange={(v) => set(key, v)}
        invalid={Boolean(errors[key])}
        placeholder={tc("choose")}
        options={rows.map((r) => ({ id: r.id, label: r.name }))}
        addLabel={t(`add.${kind}`)}
        canAdd={m.lookups.allow("tyres", "add")}
        validate={({ name }) => validateLookupName(name, rows)}
        onCreate={async ({ name }) => {
          const ops = TYRE_NAMED_OPS[kind];
          const res = await run<Record<string, { id: string }>>(ops.create, { companyId: m.lookups.companyId, name });
          await refresh();
          return res[ops.createField].id;
        }}
      />
    </Field>
  );

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && guard.requestClose()}
      size="lg"
      title={product ? t("edit.product") : t("add.product")}
      description={product ? <span dir="ltr">{product.displayName}</span> : t("productDescription")}
      footer={
        <>
          <Button variant="secondary" onClick={guard.requestClose}>
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
        <FormSection title={t("sections.product")}>
          {named("size", "tyreSizeId", m.sizes)}
          {named("brand", "tyreBrandId", m.brands)}
          {text("pattern", t("f.pattern"), { dir: "ltr" })}
          {text("plyRating", t("f.plyRating"), { type: "number" })}
          {text("loadSpeedIndex", t("f.loadSpeedIndex"), { dir: "ltr", hint: t("loadSpeedHint") })}
          <Field id="tp-status" label={tc("status")}>
            <Select id="tp-status" value={form.status} onChange={(e) => set("status", e.target.value)}>
              <option value="active">{tc("statuses.active")}</option>
              <option value="inactive">{tc("statuses.inactive")}</option>
            </Select>
          </Field>
        </FormSection>
        <FormSection title={t("sections.specs")}>
          {text("recommendedPressurePsi", t("f.pressurePsi"), { type: "number" })}
          {text("originalTreadDepthMm", t("f.treadMm"), { type: "number" })}
        </FormSection>
        <button type="submit" hidden />
      </form>
      {guard.dialog}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------------------------

function RecommendationsTab() {
  const t = useTranslations("masters.tyres.masters");
  const tc = useTranslations("masters.common");
  const m = useMasters();
  const { run, refresh, failInto } = useVmMutations();
  const errorText = useErrorText();
  const [editing, setEditing] = useState<TyreRecommendation | "new" | null>(null);
  const [deleting, setDeleting] = useState<TyreRecommendation | null>(null);
  const [form, setForm] = useState({ code: "", title: "", description: "" });
  // Until the code is typed in by hand, a new recommendation's code follows its title.
  const [codeTouched, setCodeTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const openForm = (row: TyreRecommendation | "new") => {
    setEditing(row);
    setErrors({});
    setCodeTouched(false);
    setForm(
      row === "new"
        ? { code: "", title: "", description: "" }
        : { code: row.code, title: row.title, description: row.description ?? "" },
    );
  };

  const save = async () => {
    const selfId = editing === "new" ? undefined : editing?.id;
    const found = validateRecommendation(form, m.recommendations, selfId);
    setErrors(found);
    if (Object.keys(found).length || !m.lookups.companyId) return;
    setPending(true);
    try {
      const vars = { title: form.title.trim(), description: textOrNull(form.description) };
      if (editing === "new")
        await run(CREATE_TYRE_RECOMMENDATION, { companyId: m.lookups.companyId, code: form.code.trim(), ...vars });
      else if (editing)
        await run(
          UPDATE_TYRE_RECOMMENDATION,
          { id: editing.id, ...vars },
          { previous: { description: editing.description } },
        );
      await refresh();
      toast.success(tc("saved"));
      setEditing(null);
    } catch (err) {
      failInto(err, setErrors);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <DataTable
        caption={t("tabs.recommendations")}
        rows={m.recommendations}
        loading={m.isPending}
        error={m.error ? errorText(m.error) : null}
        searchText={(r) => [r.code, r.title, r.description].filter(Boolean).join(" ")}
        toolbar={
          <Button onClick={() => openForm("new")} disabled={!m.lookups.allow("tyres", "add")}>
            <Plus />
            {t("add.recommendation")}
          </Button>
        }
        columns={[
          {
            key: "title",
            header: t("f.title"),
            sortValue: (r) => r.title,
            cell: (r) => (
              <span className="flex items-center gap-2 font-medium">
                <CircleCheck className="size-4 shrink-0 text-primary" aria-hidden />
                {r.title}
              </span>
            ),
          },
          {
            key: "code",
            header: t("f.code"),
            sortValue: (r) => r.code,
            cell: (r) => (
              <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs" dir="ltr">
                {r.code}
              </code>
            ),
          },
          {
            key: "description",
            header: t("f.description"),
            cell: (r) => <span className="text-muted-foreground">{r.description ?? "—"}</span>,
          },
        ]}
        onEdit={m.lookups.allow("tyres", "edit") ? openForm : undefined}
        onDelete={m.lookups.allow("tyres", "delete") ? setDeleting : undefined}
      />

      <Sheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === "new" ? t("add.recommendation") : t("edit.recommendation")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {tc("cancel")}
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending ? tc("saving") : tc("save")}
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
          <Field id="tr-title" label={`${t("f.title")} *`} error={errors.title}>
            <Input
              id="tr-title"
              value={form.title}
              autoFocus
              onChange={(e) => {
                const title = e.target.value;
                setForm((f) => ({
                  ...f,
                  title,
                  code: editing === "new" && !codeTouched ? codeFromTitle(title) : f.code,
                }));
              }}
            />
          </Field>
          <Field
            id="tr-code"
            label={editing === "new" ? `${t("f.code")} *` : t("f.code")}
            error={errors.code}
            hint={editing === "new" ? t("codeHint") : t("codeFixed")}
          >
            <Input
              id="tr-code"
              dir="ltr"
              className="font-mono"
              value={form.code}
              readOnly={editing !== "new"}
              disabled={editing !== "new"}
              onChange={(e) => {
                setCodeTouched(true);
                setForm((f) => ({ ...f, code: e.target.value }));
              }}
            />
          </Field>
          <Field id="tr-description" label={t("f.description")}>
            <Textarea
              id="tr-description"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </Field>
          <button type="submit" hidden />
        </form>
      </Sheet>

      <ConfirmDelete
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting?.title ?? ""}
        onConfirm={async () => {
          if (!deleting) return;
          await run(DELETE_TYRE_RECOMMENDATION, { id: deleting.id });
          await refresh();
          toast.success(tc("deleted"));
        }}
      />
    </>
  );
}
