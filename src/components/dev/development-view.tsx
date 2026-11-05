"use client";

import { Activity, CheckCircle2, CircleDashed, Code2, Flag, ListChecks, Play, RefreshCw, Server } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { PANEL } from "@/components/masters/data-table";
import { KpiCards, PageHeader, StatusBadge } from "@/components/masters/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiRequestError, gqlRequest } from "@/lib/graphql/client";
import type { BackendRequest, Checklist, Phase, RequestTone } from "@/lib/dev/plan";
import { cn } from "@/lib/utils";

/*
 * Local developer page (see app/[locale]/(app)/dev/page.tsx). English only on purpose: it is
 * a tool for the team, never shown to customers, so its text is not in messages/*.json.
 */

type Preset = {
  key: string;
  label: string;
  query: string;
  /** Variables; `$vehicle` is replaced with the first vehicle's id. */
  variables?: Record<string, unknown>;
};

/** Read-only queries only: this page never sends a mutation. */
const PRESETS: Preset[] = [
  { key: "me", label: "me", query: "query DevMe { me { id name email username companyId roles permissions } }" },
  { key: "vehicles", label: "vehicles", query: "query DevVehicles { vehicles(first: 100) { paginatorInfo { total } data { id plateNo vehicleName status companyId } } }" },
  { key: "devices", label: "devices", query: "query DevDevices { devices(first: 100) { paginatorInfo { total } data { id imei model status vehicleId lastSeenAt } } }" },
  { key: "users", label: "users", query: "query DevUsers { users(first: 100) { paginatorInfo { total } data { id name email status } } }" },
  { key: "drivers", label: "drivers", query: "query DevDrivers { drivers(first: 100) { paginatorInfo { total } data { id name employeeId } } }" },
  { key: "vehicleGroups", label: "vehicleGroups", query: "query DevGroups { vehicleGroups(first: 100) { paginatorInfo { total } data { id name parentId } } }" },
  { key: "eventTypes", label: "eventTypes", query: "query DevEventTypes { eventTypes(first: 50) { data { id name code status } } }" },
  { key: "alertRules", label: "alertRules", query: "query DevAlertRules { alertRules(first: 50) { paginatorInfo { total } data { id name eventTypeId isActive vehicleId } } }" },
  {
    key: "alertEvents",
    label: "alertEvents (first vehicle)",
    query:
      "query DevAlertEvents($vehicleId: ID) { alertEvents(vehicleId: $vehicleId, first: 20) { paginatorInfo { total } data { id eventTypeId occurredAt parameters } } }",
    variables: { vehicleId: "$vehicle" },
  },
  {
    key: "positionHistory",
    label: "positionHistory (first vehicle, latest 5)",
    query:
      "query DevPositions($vehicleId: ID) { positionHistory(vehicleId: $vehicleId, first: 5) { paginatorInfo { total } data { recordedAt locationLat locationLng speed heading ignition } } }",
    variables: { vehicleId: "$vehicle" },
  },
  {
    key: "deviceRawLogs",
    label: "deviceRawLogs (latest 5)",
    query: "query DevRawLogs { deviceRawLogs(first: 5) { paginatorInfo { total } data { id imei status protocol createdAt errorMessage } } }",
  },
];

type CheckResult = { status: "ok" | "error"; ms: number; rows: string; detail?: string };

function withVehicle(vars: Record<string, unknown> | undefined, vehicleId: string | null): Record<string, unknown> {
  if (!vars) return {};
  return Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, v === "$vehicle" ? vehicleId : v]));
}

/** "12 of 340" from the first list in a response: its length, and paginatorInfo.total when present. */
function rowSummary(data: unknown): string {
  const root = data && typeof data === "object" ? Object.values(data as Record<string, unknown>)[0] : null;
  if (root && typeof root === "object" && "data" in root && Array.isArray((root as { data: unknown }).data)) {
    const list = (root as { data: unknown[]; paginatorInfo?: { total?: number } }).data;
    const total = (root as { paginatorInfo?: { total?: number } }).paginatorInfo?.total;
    return total != null ? `${list.length} of ${total}` : `${list.length}`;
  }
  return root ? "1 object" : "null";
}

async function timed(preset: Preset, vehicleId: string | null): Promise<{ result: CheckResult; data: unknown }> {
  const started = performance.now();
  try {
    const data = await gqlRequest<unknown>(preset.query, withVehicle(preset.variables, vehicleId));
    return { result: { status: "ok", ms: Math.round(performance.now() - started), rows: rowSummary(data) }, data };
  } catch (err: unknown) {
    const detail = err instanceof ApiRequestError ? `${err.error.kind}: ${err.error.message}` : err instanceof Error ? err.message : String(err);
    return { result: { status: "error", ms: Math.round(performance.now() - started), rows: "—", detail }, data: { error: detail } };
  }
}

const TONE: Record<RequestTone, { label: string; badge: "ok" | "info" | "warn" | "muted" }> = {
  done: { label: "Done", badge: "ok" },
  partial: { label: "Partly done", badge: "info" },
  decision: { label: "Decision needed", badge: "warn" },
  pending: { label: "Pending", badge: "muted" },
};

export function DevelopmentView({
  phases,
  checklists,
  requests,
  missingDocs,
}: {
  phases: Phase[];
  checklists: Checklist[];
  requests: BackendRequest[];
  missingDocs: string[];
}) {
  const items = checklists.flatMap((c) => c.items);
  const doneItems = items.filter((i) => i.done).length;
  const doneRequests = requests.filter((r) => r.tone === "done").length;

  // Every check, run on open and on "Re-run". Vehicles first: the vehicle-scoped checks need an id.
  const api = useQuery({
    queryKey: ["dev", "api-checks"],
    queryFn: async () => {
      const vehicles = await timed(PRESETS.find((p) => p.key === "vehicles")!, null);
      const firstId = (vehicles.data as { vehicles?: { data?: Array<{ id: string }> } } | null)?.vehicles?.data?.[0]?.id ?? null;
      const rest = await Promise.all(PRESETS.filter((p) => p.key !== "vehicles").map(async (p) => [p.key, (await timed(p, firstId)).result] as const));
      return { vehicleId: firstId, checks: Object.fromEntries([["vehicles", vehicles.result], ...rest]) as Record<string, CheckResult> };
    },
    staleTime: Infinity,
    retry: false,
  });
  const running = api.isFetching;
  const vehicleId = api.data?.vehicleId ?? null;
  const checks = running ? {} : (api.data?.checks ?? {});
  const runChecks = () => void api.refetch();
  const [viewerKey, setViewerKey] = useState(PRESETS[0].key);
  const [viewer, setViewer] = useState<{ result: CheckResult; data: unknown } | null>(null);
  const [viewerBusy, setViewerBusy] = useState(false);

  const runViewer = async () => {
    setViewerBusy(true);
    setViewer(await timed(PRESETS.find((p) => p.key === viewerKey)!, vehicleId));
    setViewerBusy(false);
  };

  const okCount = Object.values(checks).filter((c) => c.status === "ok").length;
  const checkedCount = Object.keys(checks).length;
  const avgMs = checkedCount ? Math.round(Object.values(checks).reduce((s, c) => s + c.ms, 0) / checkedCount) : 0;
  const viewerPreset = PRESETS.find((p) => p.key === viewerKey)!;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Development"
        description="Local only (npm run dev). Phase progress from implementation-plan.md, backend requests from backend-changes.md, and live checks of the Klever API through this app's /api/graphql."
        actions={
          <Button onClick={runChecks} disabled={running}>
            <RefreshCw className={cn(running && "animate-spin")} />
            Re-run API checks
          </Button>
        }
      />

      {missingDocs.length > 0 ? <Alert tone="warning">Couldn’t read: {missingDocs.join(", ")} (expected one folder above web/).</Alert> : null}

      <KpiCards
        items={[
          { key: "phase", label: "Current phase", value: phases.find((p) => p.current)?.number ?? "—", icon: <Flag />, tone: "primary" },
          {
            key: "checklist",
            label: "Exit criteria done",
            value: items.length ? `${doneItems} / ${items.length}` : "—",
            icon: <ListChecks />,
            tone: doneItems === items.length ? "ok" : "warn",
          },
          { key: "backend", label: "Backend requests done", value: requests.length ? `${doneRequests} / ${requests.length}` : "—", icon: <Server />, tone: "muted" },
          {
            key: "api",
            label: running ? "API checks running…" : `API checks OK · avg ${avgMs} ms`,
            value: checkedCount ? `${okCount} / ${PRESETS.length}` : "…",
            icon: <Activity />,
            tone: checkedCount && okCount < checkedCount ? "bad" : "ok",
            highlight: checkedCount > 0 && okCount < checkedCount,
          },
        ]}
      />

      <Panel title="Phases" icon={<Flag />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/70 text-xs text-muted-foreground">
                <Th>#</Th>
                <Th>Phase</Th>
                <Th>Weeks</Th>
                <Th>Backend status</Th>
              </tr>
            </thead>
            <tbody>
              {phases.map((p) => (
                <tr key={p.number} className={cn("border-b border-border/50 last:border-0", p.current && "bg-primary-soft/60")}>
                  <Td className="font-semibold">{p.number}</Td>
                  <Td className={cn(p.current && "font-semibold")}>
                    {p.name} {p.current ? <StatusBadge tone="info">Current</StatusBadge> : null}
                  </Td>
                  <Td>{p.weeks}</Td>
                  <Td className="text-muted-foreground whitespace-normal">{p.backend}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {checklists.map((list) => {
        const done = list.items.filter((i) => i.done).length;
        const pct = Math.round((done / list.items.length) * 100);
        return (
          <Panel key={list.heading} title={list.heading} icon={<ListChecks />} aside={`${done} / ${list.items.length} · ${pct}%`}>
            <div className="px-5 pt-1 pb-3">
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <ul className="divide-y divide-border/50">
              {list.items.map((item, i) => (
                <li key={i} className="flex gap-3 px-5 py-3 text-sm">
                  {item.done ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-moving" aria-label="Done" />
                  ) : (
                    <CircleDashed className="mt-0.5 size-4 shrink-0 text-idle" aria-label="Pending" />
                  )}
                  <div className="grid gap-0.5">
                    <span className={cn(!item.done && "font-medium")}>{item.text}</span>
                    {item.note ? <span className="text-xs text-muted-foreground">{item.note}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        );
      })}

      <Panel title="Backend requests" icon={<Server />} aside={`${doneRequests} / ${requests.length} done`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/70 text-xs text-muted-foreground">
                <Th>#</Th>
                <Th>Change</Th>
                <Th>Section</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={`${r.section}-${r.id}`} className="border-b border-border/50 align-top last:border-0">
                  <Td className="font-mono font-semibold">{r.id}</Td>
                  <Td className="min-w-64 whitespace-normal">
                    {r.change}
                    {r.why ? <div className="text-xs text-muted-foreground">{r.why}</div> : null}
                  </Td>
                  <Td className="text-muted-foreground">{r.section}</Td>
                  <Td className="min-w-56 whitespace-normal">
                    <StatusBadge tone={TONE[r.tone].badge}>{TONE[r.tone].label}</StatusBadge>
                    <div className="mt-1 text-xs text-muted-foreground">{r.status}</div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Live API checks" icon={<Activity />} aside={vehicleId ? `vehicle-scoped checks use vehicle ${vehicleId}` : undefined}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/70 text-xs text-muted-foreground">
                <Th>Query</Th>
                <Th>Status</Th>
                <Th className="text-end">Time</Th>
                <Th>Rows</Th>
                <Th>Detail</Th>
              </tr>
            </thead>
            <tbody>
              {PRESETS.map((p) => {
                const c = checks[p.key];
                return (
                  <tr key={p.key} className="border-b border-border/50 last:border-0">
                    <Td className="font-mono">{p.label}</Td>
                    <Td>
                      {!c ? (
                        <StatusBadge tone="muted">{running ? "Running" : "Not run"}</StatusBadge>
                      ) : c.status === "ok" ? (
                        <StatusBadge tone="ok">OK</StatusBadge>
                      ) : (
                        <StatusBadge tone="bad">Error</StatusBadge>
                      )}
                    </Td>
                    <Td className={cn("text-end font-mono tabular-nums", c && c.ms > 2000 && "text-idle")}>{c ? `${c.ms} ms` : "—"}</Td>
                    <Td className="font-mono">{c?.rows ?? "—"}</Td>
                    <Td className="max-w-md truncate text-xs text-destructive" title={c?.detail}>
                      {c?.detail ?? ""}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="API response viewer" icon={<Code2 />} aside="read-only queries">
        <div className="grid gap-3 px-5 pb-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={viewerKey}
              onChange={(e) => {
                setViewerKey(e.target.value);
                setViewer(null);
              }}
              aria-label="Query"
              className="h-10 min-w-72 cursor-pointer rounded-xl border border-border/80 bg-surface px-3 text-sm font-semibold focus:border-primary focus:outline-none"
            >
              {PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
            <Button onClick={() => void runViewer()} disabled={viewerBusy} className="h-10 rounded-xl">
              <Play />
              Run
            </Button>
            {viewer ? (
              <span className="text-sm text-muted-foreground">
                {viewer.result.status === "ok" ? "OK" : "Error"} · {viewer.result.ms} ms · {viewer.result.rows}
              </span>
            ) : null}
          </div>
          <pre className="max-h-40 overflow-auto rounded-xl border border-border/70 bg-surface-2 p-3 font-mono text-xs whitespace-pre-wrap">
            {viewerPreset.query}
            {viewerPreset.variables ? `\n\nvariables: ${JSON.stringify(withVehicle(viewerPreset.variables, vehicleId))}` : ""}
          </pre>
          <pre
            className="max-h-[32rem] min-h-24 overflow-auto rounded-xl border border-border/70 bg-surface-2 p-3 font-mono text-xs"
            dir="ltr"
          >
            {viewer ? JSON.stringify(viewer.data, null, 2) : "Choose a query and press Run."}
          </pre>
        </div>
      </Panel>
    </div>
  );
}

function Panel({ title, icon, aside, children }: { title: string; icon: ReactNode; aside?: string; children: ReactNode }) {
  return (
    <section className={cn(PANEL, "min-w-0 overflow-hidden")}>
      <header className="flex items-center justify-between gap-3 px-5 py-4">
        <h2 className="flex items-center gap-2 text-base font-semibold [&_svg]:size-4 [&_svg]:text-primary">
          {icon}
          {title}
        </h2>
        {aside ? <span className="text-sm text-muted-foreground">{aside}</span> : null}
      </header>
      {children}
    </section>
  );
}

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return <th className={cn("px-3 py-3 text-start font-semibold whitespace-nowrap first:ps-5 last:pe-5", className)}>{children}</th>;
}

function Td({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <td title={title} className={cn("px-3 py-3 whitespace-nowrap first:ps-5 last:pe-5", className)}>
      {children}
    </td>
  );
}
