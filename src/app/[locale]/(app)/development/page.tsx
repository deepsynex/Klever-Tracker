import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { DevelopmentView } from "@/components/dev/development-view";
import { parseBackendRequests, parseChecklists, parsePhases } from "@/lib/dev/plan";

/**
 * Local developer page: phase progress, backend requests and live API checks. It exists only under
 * `npm run dev` (a 404 in production builds) and is deliberately not linked from anywhere: open it
 * by typing /en/development.
 */
export const metadata: Metadata = { title: "Development", robots: { index: false, follow: false } };

const IS_DEV = process.env.NODE_ENV === "development";

/** The planning docs live one level above the web app. */
async function readDoc(...parts: string[]): Promise<string | null> {
  try {
    return await readFile(path.join(process.cwd(), "..", ...parts), "utf8");
  } catch {
    return null;
  }
}

async function DevelopmentData() {
  await connection(); // read the docs on every load, not once at build time
  const [plan, backend] = await Promise.all([readDoc("implementation-plan.md"), readDoc("backend-requests", "backend-changes.md")]);
  return (
    <DevelopmentView
      phases={plan ? parsePhases(plan) : []}
      checklists={plan ? parseChecklists(plan) : []}
      requests={backend ? parseBackendRequests(backend) : []}
      missingDocs={[!plan && "implementation-plan.md", !backend && "backend-requests/backend-changes.md"].filter(Boolean) as string[]}
    />
  );
}

export default function DevelopmentPage() {
  if (!IS_DEV) notFound();
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-2" />}>
      <DevelopmentData />
    </Suspense>
  );
}
