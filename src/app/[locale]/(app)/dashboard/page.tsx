import { CheckCircle2, CircleDot, Hourglass } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/lib/env";
import { kleverRequest } from "@/lib/graphql/klever";
import { PING, type PingResult } from "@/lib/graphql/operations";
import { getSessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

export default function DashboardPage() {
  const t = useTranslations("dashboard");

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <div className="grid gap-1.5">
        <Suspense fallback={<h1 className="text-2xl font-semibold">{t("title")}</h1>}>
          <WelcomeHeading />
        </Suspense>
        <p className="max-w-[70ch] text-muted-foreground">{t("intro")}</p>
      </div>
      <div className="grid items-start gap-4 md:grid-cols-2">
        <Suspense fallback={<ApiStatusSkeleton />}>
          <ApiStatus />
        </Suspense>
        <SetupChecklist />
      </div>
    </div>
  );
}

async function WelcomeHeading() {
  const [user, t] = await Promise.all([getSessionUser(), getTranslations("dashboard")]);
  return <h1 className="text-2xl font-semibold">{user ? t("welcome", { name: user.name }) : t("title")}</h1>;
}

/** Calls the public `ping` query at request time to show whether the backend is reachable. */
async function ApiStatus() {
  await connection();
  const [result, t] = await Promise.all([kleverRequest<PingResult>(PING), getTranslations("dashboard.api")]);

  const state = env.mock
    ? "mock"
    : result.ok
      ? "ok"
      : ["api_locked", "gateway", "network"].includes(result.error.kind)
        ? result.error.kind
        : "unknown";
  const tone = state === "ok" ? "text-moving bg-moving/12" : state === "mock" ? "text-sand bg-sand-soft" : "text-destructive bg-destructive/12";
  const detail = result.ok ? result.data.ping : result.error.message;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold", tone)}>
          <span className="size-1.5 rounded-full bg-current" aria-hidden />
          {t(state)}
        </span>
      </CardHeader>
      {env.mock ? <p className="text-[13px] text-muted-foreground">{t("mockDetail")}</p> : null}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]">
        <dt className="text-subtle">{t("endpoint")}</dt>
        <dd className="truncate font-mono" dir="ltr">
          {env.graphqlUrl}
        </dd>
        <dt className="text-subtle">{t("response")}</dt>
        <dd className="font-mono break-words" dir="ltr">
          {detail}
        </dd>
      </dl>
    </Card>
  );
}

function ApiStatusSkeleton() {
  return (
    <Card aria-hidden>
      <div className="h-4 w-32 rounded bg-surface-3" />
      <div className="h-3 w-full rounded bg-surface-2" />
      <div className="h-3 w-2/3 rounded bg-surface-2" />
    </Card>
  );
}

type Step = { key: string; state: "done" | "next" | "blocked" };
const STEPS: Step[] = [
  { key: "foundation", state: "done" },
  { key: "auth", state: "done" },
  { key: "bff", state: "done" },
  { key: "shell", state: "done" },
  { key: "users", state: "next" },
  { key: "me", state: "blocked" },
  { key: "schema", state: "blocked" },
];

function SetupChecklist() {
  const t = useTranslations("dashboard.setup");
  const icon = { done: CheckCircle2, next: CircleDot, blocked: Hourglass };
  const color = { done: "text-moving", next: "text-primary", blocked: "text-sand" };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <ul className="grid gap-2">
        {STEPS.map((step) => {
          const Icon = icon[step.state];
          return (
            <li key={step.key} className="flex items-start gap-2.5 text-[13px]">
              <Icon className={cn("mt-0.5 size-4 shrink-0", color[step.state])} aria-hidden />
              <span className="flex-1">{t(`items.${step.key}`)}</span>
              <span className={cn("shrink-0 text-xs font-medium", color[step.state])}>{t(step.state)}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
