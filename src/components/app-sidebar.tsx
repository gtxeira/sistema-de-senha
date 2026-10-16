"use client"

import * as React from "react"
import Link from "next/link"
import type { Route } from "next"
import { ChevronRight, Headphones, History, Home, type LucideIcon, Monitor, Settings2 } from "lucide-react"
import { SearchForm } from "@/components/search-form"
import { SECTORS } from "@/lib/constants"
import type { SectorInfo } from "@/lib/constants"
import { SCREEN_ADMIN, canAccessSector, hasPermission } from "@/lib/permissions"
import type { SessionSnapshot } from "@/lib/queue"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import brandIcon from "@/app/icon.ico";
import Image from "next/image";
import { NavUser } from "@/components/nav-user";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface NavItem {
  readonly route: string
  readonly href: Route
  readonly label: string
  readonly icon: LucideIcon
}

/** Busca sem acento/caixa: "hist" e "Histórico" casam. */
const normalize = (value: string) =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()

export function AppSidebar({
  session,
  sectorInfo,
  activeRoute,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  session: SessionSnapshot | null
  /** Setor exibido no switcher do header; `null` = sem setor. */
  sectorInfo: SectorInfo | null
  /** Rota ativa, para destacar no menu. */
  activeRoute: string
}) {
  const [query, setQuery] = React.useState("")

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

  const groups = [
    { title: "Principal", items: principalItems },
    { title: "Gestão", items: manageItems },
    { title: "Chamadas", items: mainItems },
  ]
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        normalize(item.label).includes(normalize(query.trim())),
      ),
    }))
    .filter((group) => group.items.length > 0)

  const visibleSectors = Object.values(SECTORS).filter((s) =>
    canAccessSector(session, s.id, "read"),
  )

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="pointer-events-none">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg text-sidebar-primary-foreground">
                <Image src={brandIcon} alt="Logo Sistema de Senha" />
              </div>

              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-medium">Sistema de Atendimento por Senhas</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <SearchForm value={query} onValueChange={setQuery} />
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {/* Itens normais do grupo */}
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.route}>
                    <SidebarMenuButton
                      isActive={activeRoute === item.route}
                      render={<Link href={item.href} />}
                    >
                      <item.icon />
                      {item.label}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}

                {/* Exibido EXCLUSIVAMENTE no grupo "Chamadas" se houver monitores acessíveis */}
                {group.title === "Chamadas" && visibleSectors.length > 0 && (
                  <SidebarMenuItem>
                    <Collapsible defaultOpen className="group/collapsible">
                      <CollapsibleTrigger
                        render={
                          <SidebarMenuButton>
                            <Monitor className="size-4" />
                            <span>Monitores</span>
                            <ChevronRight className="ml-auto transition-transform duration-200 group-data-open/collapsible:rotate-90" />
                          </SidebarMenuButton>
                        }
                      />
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {visibleSectors.map((s) => (
                            <SidebarMenuSubItem key={s.id}>
                              <SidebarMenuSubButton
                                render={
                                  <Link
                                    href={`/monitor/${s.id}` as Route}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <span>{s.name}</span>
                                  </Link>
                                }
                              />
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </Collapsible>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="gap-0">
        <NavUser
          user={{
            name: session?.name ?? "Atendente",
            sector: sectorInfo?.name ?? "Setor Não Selecionado",
          }}
        />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}