"use client";

import type { ReactNode } from "react";
import { CheckCircle2, Clock3 } from "lucide-react";
import type { SectorInfo } from "@/lib/constants";
import type { SessionSnapshot } from "@/lib/queue";
import { useServerClock } from "@/lib/hooks/useServerClock";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export interface SidebarLayoutProps {
  /** Rota ativa, para destacar no menu. */
  readonly activeRoute: string;
  readonly session: SessionSnapshot | null;
  /** Setor exibido no switcher/rodapé; `null` = sem setor. */
  readonly sectorInfo: SectorInfo | null;
  readonly eyebrow?: string;
  readonly title?: string;
  readonly subtitle?: string;
  readonly headerActions?: ReactNode;
  readonly children?: ReactNode;
}

export function SidebarLayout({
  activeRoute,
  session,
  sectorInfo,
  eyebrow,
  title,
  subtitle,
  headerActions,
  children,
}: SidebarLayoutProps) {
  const { timeString } = useServerClock();

  return (
    <SidebarProvider
      className="h-svh overflow-hidden bg-[#f4f7fb] text-[#17324d]"
    >
      <AppSidebar
        session={session}
        sectorInfo={sectorInfo}
        activeRoute={activeRoute}
      />

      <SidebarInset className="h-svh overflow-y-auto bg-transparent p-[2vw] scroll-smooth max-[900px]:px-5.5 max-[900px]:py-7">
        <header className="flex items-start justify-between gap-5 max-[560px]:block">
          <div className="flex items-start gap-2">
            <SidebarTrigger className="-ml-1 mt-1 shrink-0" />

            <Separator
              orientation="vertical"
              className="mt-2 data-vertical:h-4 data-vertical:self-auto"
            />

            <div>
              {eyebrow && <p className="text-[10px] font-extrabold tracking-[1.25px] text-[#7990a1]">{eyebrow}</p>}
              {title && (
                <h1 className="mt-2 mb-1.25 text-[30px] font-bold text-[#13324d]">
                  {title}
                </h1>
              )}
              {subtitle && <p className="text-[13px] text-[#7590a0]">{subtitle}</p>}
            </div>
          </div>

          <div className="flex items-center gap-4.5 text-[12px] text-[#658296] max-[900px]:flex-wrap max-[900px]:justify-end max-[560px]:justify-start max-[560px]:mt-4.5">
            <div className="flex items-center gap-1.75 font-bold text-[#159883]">
              <CheckCircle2 size={16} /> Sistema online
            </div>

            {headerActions}

            <div className="flex items-center gap-1.25">
              <Clock3 size={16} /> {timeString || "--:--:--"}
            </div>
          </div>
        </header>

        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
