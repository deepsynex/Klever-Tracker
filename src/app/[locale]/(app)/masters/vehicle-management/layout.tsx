import { VmNav } from "@/components/masters/vm-nav";

export default function VehicleManagementLayout({ children }: LayoutProps<"/[locale]/masters/vehicle-management">) {
  return (
    <div className="mx-auto grid max-w-[1400px] gap-4">
      <VmNav />
      {children}
    </div>
  );
}
