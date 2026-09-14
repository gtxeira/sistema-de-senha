"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut, Monitor, Settings2, Headphones } from "lucide-react";
import { getSessionSnapshot, SESSION_KEY, SECTORS } from "../../lib/queue";
import styles from "./Home.module.css";
import Image from 'next/image';
import brandIcon from '@/app/icon.jpeg';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    if (!getSessionSnapshot()) router.push("/login");
  }, [router]);

  const session = getSessionSnapshot();
  if (!session) return null;

  function logout() {
    window.localStorage.removeItem(SESSION_KEY);
    signOut({ callbackUrl: "/login" });
  }

  return (
    <main className={styles.page}>

      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerBrand}>
          <div className={styles.headerMark}>
            <Image
              src={brandIcon}
              alt="Logo"
              width={40}
              height={40}
              priority
            />
          </div>
          <span>Central de Atendimento</span>
        </div>
        <div className={styles.headerUser}>
          <span className={styles.userName}>{session.name}</span>
          <button className={styles.logoutBtn} onClick={logout}>
            <LogOut size={15} /> Sair
          </button>
        </div>
      </header>

      {/* ── Conteúdo ── */}
      <div className={styles.content}>
        <div className={styles.greeting}>
          <p>BEM-VINDO</p>
          <h1>O que deseja fazer?</h1>
        </div>

        <div className={styles.grid}>

          {/* Monitores */}
          {Object.values(SECTORS).map((s) => (
            <Link key={s.id} href={`/monitor/${s.id}`} className={styles.card}>
              <div className={`${styles.cardIcon} ${styles.cardIconMonitor}`}>
                <Monitor size={30} />
              </div>
              <div className={styles.cardBody}>
                <strong>Monitor</strong>
                <span>{s.name}</span>
              </div>
              <div className={styles.cardArrow}>→</div>
            </Link>
          ))}

          {/* Painel de Atendimento */}
          <Link href="/painel" className={`${styles.card} ${styles.cardAdmin}`}>
            <div className={`${styles.cardIcon} ${styles.cardIconAtendimento}`}>
              <Headphones size={30} />
            </div>
            <div className={styles.cardBody}>
              <strong>Painel de Atendimento</strong>
              <span>Controle as chamadas em tempo real</span>
            </div>
            <div className={styles.cardArrow}>→</div>
          </Link>

          {/* Admin — só para admins */}
          {session.role === "admin" && (
            <Link href="/admin" className={`${styles.card} ${styles.cardAdmin}`}>
              <div className={`${styles.cardIcon} ${styles.cardIconAdmin}`}>
                <Settings2 size={30} />
              </div>
              <div className={styles.cardBody}>
                <strong>Administração</strong>
                <span>Filas, notícias e estatísticas</span>
              </div>
              <div className={styles.cardArrow}>→</div>
            </Link>
          )}

        </div>
      </div>
    </main>
  );
}
