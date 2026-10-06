"use client";

import { useState } from "react";
import Link from "next/link";
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
import { SECTORS, SESSION_KEY } from "@/lib/constants.js";
import { SCREEN_ADMIN, canAccessSector, hasPermission } from "@/lib/permissions.js";
import { useServerClock } from "@/lib/hooks/useServerClock.js";
import styles from "./SidebarLayout.module.css";

export { styles as sidebarStyles };

const NAV_ITEMS = [
  { route: "home",      href: "/home",      icon: Home,     label: "Home" },
  { route: "admin",     href: "/admin",     icon: Settings2, label: "Administração", permission: SCREEN_ADMIN },
  { route: "painel",    href: "/painel",    icon: Bell,     label: "Chamadas" },
  { route: "historico", href: "/historico", icon: Clock3,   label: "Histórico" },
];

export function SidebarLayout({
  activeRoute,
  session,
  sectorInfo,
  eyebrow,
  title,
  subtitle,
  headerActions,
  children,
}) {
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

  async function handleLogout(e) {
    e.preventDefault();
    // Revoga a família do refresh token antes do signOut do Auth.js —
    // senão uma aba esquecida poderia "acordar" com o refresh antigo.
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // segue o signOut mesmo sem a revogação (rede)
    }
    window.localStorage.removeItem(SESSION_KEY);
    signOut({ callbackUrl: "/login" });
  }

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <nav className={styles.nav}>
          {visibleNavItems.map((item) => (
            <Link
              key={item.route}
              href={item.href}
              className={activeRoute === item.route ? styles.activeNav : undefined}
            >
              <item.icon size={18}/>
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            className={`${styles.navItem} ${monitorsOpen ? styles.activeNav : ""}`}
            onClick={() => setMonitorsOpen(!monitorsOpen)}
          >
            <Monitor size={18}/>
            Monitores
            <ChevronDown
              size={14}
              className={`${styles.chevron} ${monitorsOpen ? styles.chevronOpen : ""}`}
            />
          </button>
          {monitorsOpen && (
            <div className={styles.monitorSubmenu}>
              {visibleSectors.map((s) => (
                <a
                  key={s.id}
                  href={`/monitor/${s.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.monitorItem}
                >
                  {s.name}
                </a>
              ))}
            </div>
          )}
        </nav>
        <div className={styles.sidebarFoot}>
          <div className={styles.profile}>
            <div className={styles.avatar}>{session?.initials || "AT"}</div>
            <div>
              <strong>{session?.name || "Atendente"}</strong>
              <small>{sectorInfo?.name || ""}</small>
            </div>
          </div>
          <Link
            href="/login"
            className={styles.logout}
            onClick={handleLogout}
          >
            <LogOut size={17} /> Sair
          </Link>
        </div>
      </aside>

      <section className={styles.main}>
        <header className={styles.header}>
          <div>
            {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
            {title && <h1>{title}</h1>}
            {subtitle && <p className={styles.muted}>{subtitle}</p>}
          </div>
          <div className={styles.headerActions}>
            <div className={styles.connection}>
              <CheckCircle2 size={16} /> Sistema online
            </div>
            {headerActions}
            <div className={styles.headerTime}>
              <Clock3 size={16} /> {timeString || "--:--:--"}
            </div>
          </div>
        </header>
        {children}
      </section>
    </main>
  );
}
