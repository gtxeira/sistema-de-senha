"use client"

import React from "react";
import { SidebarLayout } from "@/components/SidebarLayout/SidebarLayout";
import { usePathname } from "next/navigation";
import { useDashboardLayoutStore } from "@/stores/use-dashboard-layout-store";
import { useSession } from "@/stores/use-session-store";
import { cn } from "@/lib/utils";

export default function DashboardLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const pathname = usePathname();
  const activeRoute = pathname.split("/")[1] || "home";

  const session = useSession();

  const sectorInfo = useDashboardLayoutStore((s) => s.sectorInfo);
  const headerActions = useDashboardLayoutStore((s) => s.headerActions);

  const eyebrow = useDashboardLayoutStore((s) => s.eyebrow);
  const title = useDashboardLayoutStore((s) => s.title);
  const subtitle = useDashboardLayoutStore((s) => s.subtitle);

  return (
    <SidebarLayout
      activeRoute={activeRoute}
      session={session}
      sectorInfo={sectorInfo}
      headerActions={headerActions}
    >
      {(eyebrow || title || subtitle) && (
        <div className="mt-4 mb-3 sm:mt-5">
          {eyebrow && (
            <p className="text-[10px] font-extrabold tracking-[1.25px] text-[#7990a1]">
              {eyebrow}
            </p>
          )}
          {title && (
            <h1 className={cn("mt-2 text-[24px] font-bold text-[#13324d] sm:text-[30px]", subtitle && "mb-1.25")}>
              {title}
            </h1>
          )}
          {subtitle && (
            <p className="text-[13px] text-[#7590a0]">{subtitle}</p>
          )}
        </div>
      )}

      <div>{children}</div>
    </SidebarLayout>
  );
}