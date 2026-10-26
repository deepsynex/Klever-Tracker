import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("notFound");
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="grid max-w-md justify-items-start gap-3">
        <p className="font-mono text-sm text-subtle">404</p>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("body")}</p>
        <Button asChild>
          <Link href="/dashboard">{t("home")}</Link>
        </Button>
      </div>
    </main>
  );
}
