import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/masters/page-header";
import { VM_MODULES } from "@/components/masters/vm-modules";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.vm");
  return { title: t("title") };
}

/** Vehicle Management overview: one card per sub-module. */
export default function VehicleManagementPage() {
  const t = useTranslations("masters.vm");
  return (
    <div className="grid gap-4">
      <PageHeader title={t("title")} description={t("description")} />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {VM_MODULES.map((m) => (
          <li key={m.key}>
            <Link
              href={m.href}
              className="grid h-full gap-1.5 rounded-card border border-border bg-surface p-4 transition-colors hover:border-primary/50 hover:bg-primary-soft/30"
            >
              <span className="flex items-center gap-2 text-sm font-semibold [&_svg]:size-4 [&_svg]:text-primary">
                <m.icon aria-hidden />
                {t(`modules.${m.key}`)}
              </span>
              <span className="text-[13px] text-muted-foreground">{t(`moduleHints.${m.key}`)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
