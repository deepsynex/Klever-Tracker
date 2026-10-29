import type { ReactNode } from "react";
import { FleetMapMotion } from "@/components/auth/fleet-map-motion";
import { LocaleSwitcher } from "@/components/locale-switcher";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full flex-col lg:flex-row bg-[#f4f6fa] text-slate-900 overflow-x-hidden">
      {/* LEFT COLUMN: REAL-TIME FLEET MAP & MOTION ANIMATION (62% desktop) */}
      <aside className="relative hidden w-full lg:block lg:w-[60%] xl:w-[62%] min-h-[500px] lg:min-h-dvh">
        <FleetMapMotion />
      </aside>

      {/* RIGHT COLUMN: AUTHENTICATION FORM (38% desktop) */}
      <div className="relative flex flex-1 flex-col justify-between px-4 py-6 sm:px-8 lg:px-10">
        {/* Top Header: Language Switcher with globe */}
        <header className="flex w-full justify-end items-center gap-2">
          <LocaleSwitcher />
        </header>

        {/* Centered Login Card Container */}
        <main className="flex flex-1 items-center justify-center py-6">
          <div className="w-full max-w-[440px]">
            {children}
          </div>
        </main>

        {/* Subtle Bottom Spacer */}
        <footer className="h-4" />
      </div>
    </div>
  );
}
