import { CHANGE_PASSWORD_HREF } from "@/components/masters/am-modules";
import { CompanyPicker } from "@/components/masters/company-picker";
import { AmNav, ModuleGuard } from "@/components/masters/vm-nav";
import { CompanyScopeProvider } from "@/lib/vehicle-management/company-scope";

export default function AccountManagementLayout({ children }: LayoutProps<"/[locale]/masters/account-management">) {
  return (
    <CompanyScopeProvider>
      <div className="mx-auto grid max-w-[1400px] gap-4">
        <CompanyPicker hideOn={[CHANGE_PASSWORD_HREF]} />
        <AmNav />
        <ModuleGuard which="am">{children}</ModuleGuard>
      </div>
    </CompanyScopeProvider>
  );
}
