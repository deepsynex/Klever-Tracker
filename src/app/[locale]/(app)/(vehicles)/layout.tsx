import type { ReactNode } from "react";
import { CompanyPicker } from "@/components/masters/company-picker";
import { ModuleGuard } from "@/components/masters/vm-nav";
import { CompanyScopeProvider } from "@/lib/vehicle-management/company-scope";

/** Vehicles sections (/vehicles, /allocations …). A route group, so it adds nothing to the URL. */
export default function VehicleManagementLayout({ children }: { children: ReactNode }) {
  return (
    <CompanyScopeProvider>
      <div className="mx-auto grid max-w-[1400px] gap-4">
        <CompanyPicker />
        <ModuleGuard which="vm">{children}</ModuleGuard>
      </div>
    </CompanyScopeProvider>
  );
}
