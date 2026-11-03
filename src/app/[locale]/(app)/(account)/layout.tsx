import type { ReactNode } from "react";
import { AUDIT_HREF, CHANGE_PASSWORD_HREF, PROFILE_HREF } from "@/components/masters/am-modules";
import { CompanyPicker } from "@/components/masters/company-picker";
import { ModuleGuard } from "@/components/masters/vm-nav";
import { CompanyScopeProvider } from "@/lib/vehicle-management/company-scope";

/** Account & settings sections (/accounts, /users …). A route group, so it adds nothing to the URL. */
export default function AccountManagementLayout({ children }: { children: ReactNode }) {
  return (
    <CompanyScopeProvider>
      <div className="mx-auto grid max-w-[1400px] gap-4">
        <CompanyPicker hideOn={[CHANGE_PASSWORD_HREF, PROFILE_HREF, AUDIT_HREF]} />
        <ModuleGuard which="am">{children}</ModuleGuard>
      </div>
    </CompanyScopeProvider>
  );
}
