"use client";

import type { ReactNode } from "react";
import { CheckCircle2, Headphones, History, Home, type LucideIcon, Settings2 } from "lucide-react";
import type { SectorInfo } from "@/lib/constants";
import type { SessionSnapshot } from "@/lib/queue";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList, BreadcrumbPage,
  BreadcrumbSeparator
} from "@/components/ui/breadcrumb";
import { hasPermission, SCREEN_ADMIN } from "@/lib/permissions";
import type { Route } from "next";
import { ServerClock } from "@/components/server-clock";

export interface NavItem {
  readonly route: string
  readonly href: Route
  readonly label: string
  readonly icon: LucideIcon
}

export interface RouteGroup {
  readonly title: string
  readonly items: readonly NavItem[]
}

export interface SidebarLayoutProps {
  /** Rota ativa, para destacar no menu. */
  readonly activeRoute: string;
  readonly session: SessionSnapshot | null;
  /** Setor exibido no switcher/rodapé; `null` = sem setor. */
  readonly sectorInfo?: SectorInfo;
  readonly headerActions?: ReactNode;
  readonly children?: ReactNode;
}

export function SidebarLayout({
  activeRoute,
  session,
  sectorInfo,
  headerActions,
  children,
}: SidebarLayoutProps) {
  const principalItems: readonly NavItem[] = [
    { route: "home", href: "/home", label: "Home", icon: Home },
  ]

  const mainItems: readonly NavItem[] = [
    { route: "painel", href: "/painel", label: "Painel de Atendimentos", icon: Headphones },
    { route: "historico", href: "/historico", label: "Histórico", icon: History },
  ]

  const manageItems: readonly NavItem[] = hasPermission(session, SCREEN_ADMIN)
    ? [{ route: "admin", href: "/admin", label: "Administração", icon: Settings2 }]
    : []

  const groups: RouteGroup[] = [
    { title: "Principal", items: principalItems },
    { title: "Gestão", items: manageItems },
    { title: "Chamadas", items: mainItems },
  ];

  const currentGroupItem = groups.flatMap((group) => group.items).find((item) => item.route === activeRoute)!;
  const currentGroup = groups.find((group) => group.items.includes(currentGroupItem))!;

  return (
    <SidebarProvider
      className="h-svh overflow-hidden bg-[#f4f7fb] text-[#17324d]"
    >
      <AppSidebar
        session={session}
        sectorInfo={sectorInfo}
        activeRoute={activeRoute}
        routeGroups={groups}
      />

      <SidebarInset>
        <header className="sticky top-0 flex shrink-0 items-center justify-between gap-2 border-b bg-background p-3 px-6">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1 mt-1 shrink-0" />

            <Separator
              orientation="vertical"
              className=" data-vertical:h-6 data-vertical:self-auto"
            />

            <Breadcrumb className="pointer-events-none">
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="#">{currentGroup.title}</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{currentGroupItem.label}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <div className="flex items-center gap-4.5 text-[12px] text-[#658296] max-[900px]:flex-wrap max-[900px]:justify-end max-[560px]:justify-start max-[560px]:mt-4.5">
            <div className="flex items-center gap-1.75 font-bold text-[#159883]">
              <CheckCircle2 size={16} /> Sistema online
            </div>

            {headerActions}

            <ServerClock />
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-4 p-6 pt-2 overflow-y-auto w-full max-w-full min-w-0">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
