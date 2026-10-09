"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { signOut } from "next-auth/react";
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Home,
  LogOut,
  Monitor,
  Settings2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SECTORS, SESSION_KEY } from "@/lib/constants";
import type { SectorInfo } from "@/lib/constants";
import { SCREEN_ADMIN, canAccessSector, hasPermission } from "@/lib/permissions";
import type { Permission } from "@/lib/permissions";
import type { SessionSnapshot } from "@/lib/queue";
import { useServerClock } from "@/lib/hooks/useServerClock";
import styles from "./SidebarLayout.module.css";

/* `sectorSelect` e `monitorLink` seguem no módulo: são consumidos pelo
   painel e pelo histórico no slot `headerActions` até as etapas 4/5 da
   Fase 2 — quando essas telas migrarem, o módulo é apagado. */
export { styles as sidebarStyles };

interface NavItem {
  readonly route: string;
  /** Rota estática — o `href` do `Link` não aceita `string` solta. */
  readonly href: Route;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly permission?: Permission;
}

const NAV_ITEMS: readonly NavItem[] = [
  { route: "home",      href: "/home",      icon: Home,     label: "Home" },
  { route: "admin",     href: "/admin",     icon: Settings2, label: "Administração", permission: SCREEN_ADMIN },
  { route: "painel",    href: "/painel",    icon: Bell,     label: "Chamadas" },
  { route: "historico", href: "/historico", icon: Clock3,   label: "Histórico" },
];

/* ── Estilos do shell (eram classes do SidebarLayout.module.css) ── */

/* Base dos itens de navegação/rodapé — replica a regra agrupada
   `.nav a, .navItem, .logout` do módulo antigo. */
const itemStyle =
  "flex items-center gap-3 rounded-[9px] px-3.5 py-[13px] text-[14px] text-[#aac2d0]";
/** Hover/ativo — `.nav a:hover, .navItem:hover, .activeNav` (o `!important`
    do branco original não é necessário: o valor é o mesmo). */
const itemHoverStyle = "hover:bg-[#174a6d] hover:text-white";
const itemActiveStyle = "bg-[#174a6d] text-white";
/** Itens do `<nav>` — `.nav a` inclusive no responsive de 900px
    (`font-size: 0` esconde o texto, deixando só o ícone). */
const navLinkStyle = `${itemStyle} ${itemHoverStyle} max-[900px]:text-[0px] max-[900px]:justify-center`;
/** O `<button>` da nav NÃO era alcançado por `.nav a` no módulo — por isso
    não herda o `font-size: 0` do responsive de 900px (comportamento
    original preservado). */
const navButtonStyle = `${itemStyle} ${itemHoverStyle} w-full cursor-pointer border-current text-left`;
/** Itens do submenu: por especificidade, `.nav a` vencia as propriedades
    próprias de `.monitorItem` no módulo — o efeito renderizado era a base
    da nav + a transition única do `.monitorItem`. */
const monitorItemStyle = `${navLinkStyle} transition-[background-color,color] duration-150`;
/** `.logout` no módulo sobrescrevia o grupo: borda superior, raio 0 e
    padding-top 18px (px/pb herdados do grupo: 14px/13px). */
const logoutStyle =
  "flex items-center gap-3 rounded-none border-t border-[#28536d] px-3.5 pt-[18px] pb-[13px] text-[14px] text-[#aac2d0] max-[900px]:text-[0px] max-[900px]:justify-center";

export interface SidebarLayoutProps {
  /** Rota ativa, para destacar no menu. */
  readonly activeRoute: string;
  readonly session: SessionSnapshot | null;
  /** Setor exibido no rodapé do perfil; `null` = sem setor. */
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
  const [monitorsOpen, setMonitorsOpen] = useState(false);
  // Itens de tela filtrados pelas permissões da sessão (o proxy também
  // bloqueia no servidor — aqui é só a parte visual).
  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.permission || hasPermission(session, item.permission),
  );
  const visibleSectors = Object.values(SECTORS).filter((s) =>
    canAccessSector(session, s.id, "read"),
  );

  async function handleLogout(e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    // Revoga a família do refresh token antes do signOut do Auth.js —
    // senão uma aba esquecida poderia "acordar" com o refresh antigo.
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // segue o signOut mesmo sem a revogação (rede)
    }
    window.localStorage.removeItem(SESSION_KEY);
    void signOut({ callbackUrl: "/login" });
  }

  return (
    <main className="flex h-screen overflow-hidden bg-[#f4f7fb] text-[#17324d]">
      <aside className="flex h-screen w-[252px] shrink-0 flex-col overflow-y-auto bg-[#0b3555] px-[18px] pt-7 pb-5 text-[#d5e4ee] max-[900px]:w-[72px] max-[900px]:px-[9px] max-[900px]:py-[22px]">
        <nav className="grid gap-[7px]">
          {visibleNavItems.map((item) => (
            <Link
              key={item.route}
              href={item.href}
              className={
                activeRoute === item.route
                  ? `${navLinkStyle} ${itemActiveStyle}`
                  : navLinkStyle
              }
            >
              <item.icon size={18}/>
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            className={`${navButtonStyle} ${monitorsOpen ? itemActiveStyle : "bg-transparent"}`}
            onClick={() => setMonitorsOpen(!monitorsOpen)}
          >
            <Monitor size={18}/>
            Monitores
            <ChevronDown
              size={14}
              className={`ml-auto transition-transform duration-200 ${monitorsOpen ? "rotate-180" : ""}`}
            />
          </button>
          {monitorsOpen && (
            <div className="mt-[-2px] flex flex-col gap-0.5 pl-5">
              {visibleSectors.map((s) => (
                <a
                  key={s.id}
                  href={`/monitor/${s.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={monitorItemStyle}
                >
                  {s.name}
                </a>
              ))}
            </div>
          )}
        </nav>
        <div className="mt-auto">
          <div className="flex items-center gap-2.5 border-t border-[#28536d] px-2.5 pt-[18px] pb-[15px]">
            <div className="grid size-[34px] shrink-0 place-items-center rounded-[50%] bg-[#d8f4ee] text-[11px] font-extrabold text-[#168778]">
              {session?.initials || "AT"}
            </div>
            <div className="max-[900px]:text-[0px] max-[900px]:justify-center">
              <strong className="block text-[12px] text-white">{session?.name || "Atendente"}</strong>
              <small className="text-[11px] text-[#8eabbc]">{sectorInfo?.name || ""}</small>
            </div>
          </div>
          <Link
            href="/login"
            className={logoutStyle}
            onClick={(e) => void handleLogout(e)}
          >
            <LogOut size={17} /> Sair
          </Link>
        </div>
      </aside>

      <section className="m-auto h-screen flex-1 overflow-y-auto p-[2vw] scroll-smooth max-[900px]:px-[22px] max-[900px]:py-7">
        <header className="flex items-start justify-between gap-5 max-[560px]:block">
          <div>
            {eyebrow && <p className="text-[10px] font-extrabold tracking-[1.25px] text-[#7990a1]">{eyebrow}</p>}
            {title && (
              <h1 className="mt-2 mb-[5px] text-[30px] font-bold text-[#13324d] [&_span]:text-[24px]">
                {title}
              </h1>
            )}
            {subtitle && <p className="text-[13px] text-[#7590a0]">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-[18px] text-[12px] text-[#658296] max-[900px]:flex-wrap max-[900px]:justify-end max-[560px]:justify-start max-[560px]:mt-[18px]">
            <div className="flex items-center gap-[7px] font-bold text-[#159883]">
              <CheckCircle2 size={16} /> Sistema online
            </div>
            {headerActions}
            <div className="flex items-center gap-[5px]">
              <Clock3 size={16} /> {timeString || "--:--:--"}
            </div>
          </div>
        </header>
        {children}
      </section>
    </main>
  );
}
