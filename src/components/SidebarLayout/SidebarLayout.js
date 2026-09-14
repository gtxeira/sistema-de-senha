"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  Bell,
  Clock3,
  Home,
  LogOut,
  Settings2,
} from "lucide-react";
import { SECTORS, SESSION_KEY } from "../../lib/queue";
import styles from "./SidebarLayout.module.css";

export { styles as sidebarStyles };

const NAV_ITEMS = [
  { route: "home",      href: "/home",      icon: Home,     label: "Home" },
  { route: "admin",      href: "/admin",      icon: Settings2,     label: "Administração", onlyAdmin: true },
  { route: "painel",    href: "/painel",    icon: Bell,     label: "Chamadas" },
  { route: "historico", href: "/historico",  icon: Clock3,   label: "Histórico" },
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
  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.onlyAdmin || session?.role === "admin"
  );

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
            onClick={() => {
              window.localStorage.removeItem(SESSION_KEY);
              signOut({ callbackUrl: "/login" });
            }}
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
          {headerActions && (
            <div className={styles.headerActions}>
              {headerActions}
            </div>
          )}
        </header>
        {children}
      </section>
    </main>
  );
}
