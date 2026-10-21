"use client";

import type { ReactNode } from "react";
import { CheckCircle2, Headphones, History, Home, type LucideIcon, Settings2 } from "lucide-react";
import type { SectorInfo } from "@/lib/constants";
import type { User } from "next-auth";
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
  readonly session: User | null;
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

  /* Sem sessão (prerender do build) o item da rota ativa não existe nos
     grupos — "Administração" só entra no menu com a permissão `tela.admin`.
     O breadcrumb precisa tolerar isso em vez de estourar no `undefined`. */
  const currentGroupItem = groups
    .flatMap((group) => group.items)
    .find((item) => item.route === activeRoute);
  const currentGroup = currentGroupItem
    ? groups.find((group) => group.items.includes(currentGroupItem))
    : undefined;

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

      {/* `min-w-0` no inset: sem ele o flex item não encolhe abaixo da
          largura do conteúdo e a página inteira passa a vazar na
          horizontal quando há sidebar aberta. */}
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-2 border-b bg-background p-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger className="-ml-1 mt-1 shrink-0" />

            <Separator
              orientation="vertical"
              className="data-vertical:h-6 data-vertical:self-auto"
            />

            <Breadcrumb className="pointer-events-none min-w-0">
              <BreadcrumbList className="min-w-0">
                {currentGroup && (
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink href="#">{currentGroup.title}</BreadcrumbLink>
                  </BreadcrumbItem>
                )}
                {currentGroup && (
                  <BreadcrumbSeparator className="hidden md:block" />
                )}
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbPage className="truncate">
                    {currentGroupItem?.label ?? ""}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          {/* Status, ações da tela e relógio: uma linha própria no mobile
              (o header tem largura de ~342px lá) e na mesma linha do
              breadcrumb a partir de `sm`. */}
          <div className="flex w-full items-center gap-3 text-[12px] text-[#658296] sm:w-auto sm:justify-end sm:gap-4.5">
            <div className="flex items-center gap-1.75 font-bold text-[#159883]">
              <CheckCircle2 size={16} className="shrink-0" /> Sistema online
            </div>

            {headerActions}

            <ServerClock />
          </div>
        </header>

        <main className="flex w-full max-w-full min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-3 pt-2 sm:p-6 sm:pt-2">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
