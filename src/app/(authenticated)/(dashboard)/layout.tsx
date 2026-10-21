"use client"

import React, { useSyncExternalStore } from "react";
import { SidebarLayout } from "@/components/SidebarLayout/SidebarLayout";
import { getServerSessionSnapshot, getSessionSnapshot, subscribeSession } from "@/lib/queue";
import { usePathname } from "next/navigation";
import { useDashboardLayoutStore } from "@/stores/use-dashboard-layout-store";
import { cn } from "@/lib/utils";

export default function DashboardLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const pathname = usePathname();
  const activeRoute = pathname.split("/")[1] || "home";

  const session = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    getServerSessionSnapshot
  );

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
        <div className="mt-5 mb-3">
          {eyebrow && (
            <p className="text-[10px] font-extrabold tracking-[1.25px] text-[#7990a1]">
              {eyebrow}
            </p>
          )}
          {title && (
            <h1 className={cn("mt-2 text-[30px] font-bold text-[#13324d]", subtitle && "mb-1.25")}>
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