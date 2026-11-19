/**
 * Which modules each company may use, chosen by platform staff (backend request T4). A company's
 * roles can only grant modules the company has; everything else is hidden from its users.
 * Pure rules here (unit tested); the hook is in use-company-modules.ts.
 */

/** Always on: without them a company admin couldn't manage the account, users and roles. */
export const ALWAYS_ON_MODULES = ["core"] as const;

export const isAlwaysOn = (code: string) => (ALWAYS_ON_MODULES as readonly string[]).includes(code);

/** The codes after ticking or unticking one; always-on modules can't be removed. */
export function toggleModule(codes: string[], code: string, on: boolean): string[] {
  if (isAlwaysOn(code) && !on) return codes;
  const next = new Set(codes);
  if (on) next.add(code);
  else next.delete(code);
  return [...next].sort();
}

/** Every module on (what a new company starts with, and every company until the backend has T4). */
export function allModuleCodes(modules: Array<{ code: string }>): string[] {
  return modules.map((m) => m.code).sort();
}

/**
 * The modules a role of this company can be given. `enabled` null means the company's list isn't
 * known (the API doesn't have it yet, or "all companies" is selected): every module is offered.
 */
export function modulesForCompany<T extends { code: string }>(modules: T[], enabled: string[] | null): T[] {
  if (!enabled) return modules;
  const set = new Set(enabled);
  return modules.filter((m) => set.has(m.code) || isAlwaysOn(m.code));
}

/** Whether two code lists hold the same modules (order doesn't matter). */
export function sameModules(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((c) => set.has(c));
}
