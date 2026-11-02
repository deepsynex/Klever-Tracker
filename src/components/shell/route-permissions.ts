import type { PermissionModule } from "@/lib/permissions";

/** Every tracking screen reads live or historical positions (API Doc §6.16, §6.18). */
export const TRACKING_PERMISSION: PermissionModule = "live-position";

/**
 * Top-level routes (locale stripped) and the permission module they need to view. The Masters
 * screens have their own per-tab guard (ModuleGuard); Dashboard and the account pages are for everyone.
 */
const ROUTES: Array<[prefix: string, module: PermissionModule]> = [
  ["/live", TRACKING_PERMISSION],
  ["/detailed", TRACKING_PERMISSION],
  ["/live-traversed", TRACKING_PERMISSION],
  ["/history", TRACKING_PERMISSION],
  ["/live-route", TRACKING_PERMISSION],
  ["/multi", TRACKING_PERMISSION],
  ["/heatmap", TRACKING_PERMISSION],
  ["/video-monitoring", TRACKING_PERMISSION],
  ["/sales", TRACKING_PERMISSION],
  ["/tracking", TRACKING_PERMISSION],
];

/** The module a path needs, or null when it isn't guarded here. */
export function requiredModule(pathname: string): PermissionModule | null {
  for (const [prefix, module] of ROUTES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return module;
  }
  return null;
}
