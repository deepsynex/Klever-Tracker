import type { ReactNode } from "react";
import { CompanyPicker } from "@/components/masters/company-picker";
import { ModuleGuard } from "@/components/masters/vm-nav";
import { CompanyScopeProvider } from "@/lib/vehicle-management/company-scope";

/** Tyres sections (/customers, /customer-vehicles, /tyre-masters). A route group, so it adds nothing to the URL. */
export default function TyresLayout({ children }: { children: ReactNode }) {
  return (
    <CompanyScopeProvider>
      <div className="mx-auto grid max-w-[1400px] gap-4">
        <CompanyPicker />
        <ModuleGuard which="tyres">{children}</ModuleGuard>
      </div>
    </CompanyScopeProvider>
  );
}
