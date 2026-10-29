"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Which company a platform account (no company of its own, sees every company) is working in.
 * "all" = every company, view only. Company users ignore this: they only ever see their own.
 * Kept for the browser session so it stays the same across the Vehicle Management tabs.
 */
export const ALL_COMPANIES = "all";
const STORAGE_KEY = "vm.company";

type Scope = { selected: string; setSelected: (companyId: string) => void };

const CompanyScopeContext = createContext<Scope>({ selected: ALL_COMPANIES, setSelected: () => {} });

export function CompanyScopeProvider({ children }: { children: ReactNode }) {
  const [selected, setSelectedState] = useState<string>(ALL_COMPANIES);

  // Restore after mount (sessionStorage isn't available during server rendering).
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from browser storage
      if (saved) setSelectedState(saved);
    } catch {
      /* storage blocked: keep the default */
    }
  }, []);

  const setSelected = useCallback((companyId: string) => {
    setSelectedState(companyId);
    try {
      sessionStorage.setItem(STORAGE_KEY, companyId);
    } catch {
      /* storage blocked: the choice lasts until reload */
    }
  }, []);

  return <CompanyScopeContext.Provider value={{ selected, setSelected }}>{children}</CompanyScopeContext.Provider>;
}

export function useCompanyScope(): Scope {
  return useContext(CompanyScopeContext);
}
