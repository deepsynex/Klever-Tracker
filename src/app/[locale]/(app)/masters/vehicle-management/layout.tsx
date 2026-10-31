import { CompanyPicker } from "@/components/masters/company-picker";
import { ModuleGuard } from "@/components/masters/vm-nav";
import { CompanyScopeProvider } from "@/lib/vehicle-management/company-scope";

export default function VehicleManagementLayout({ children }: LayoutProps<"/[locale]/masters/vehicle-management">) {
  return (
    <CompanyScopeProvider>
      <div className="mx-auto grid max-w-[1400px] gap-4">
        <CompanyPicker />
        <ModuleGuard which="vm">{children}</ModuleGuard>
      </div>
    </CompanyScopeProvider>
  );
}
