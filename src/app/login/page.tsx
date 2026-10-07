"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { LockKeyhole } from "lucide-react";
import { writeSessionSnapshot } from "@/lib/queue";
import { readJson } from "@/lib/json";
import type { AuthSessionBody } from "@/types/api";
import styles from "./Login.module.css";
import brandIcon from "@/app/icon.ico";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        username: login,
        password,
        redirect: false,
      });

      if (result?.error) {
        throw new Error("Usuário ou senha inválidos.");
      }

      // Busca a sessão estabelecida pelo Auth.js e espelha os claims
      // (permissões/setor) no snapshot local usado pelos guards de tela.
      const res = await fetch("/api/auth/session");
      const session = await readJson<AuthSessionBody>(res);

      if (session?.user) {
        writeSessionSnapshot(session.user);

        // Emite o refresh token (12h) junto com o login — é ele que permite
        // "acordar" a sessão após 15min de idle sem digitar a senha de novo.
        await fetch("/api/auth/refresh", { method: "POST" }).catch(() => {});
      }

      router.push("/home");
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Usuário ou senha inválidos.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      {/* ── Hero ── */}
      <div className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.heroMark}>
            <Image
              src={brandIcon}
              alt="Logo"
              priority
            />
          </div>
          <h1>
            Sistema de
            <br />
            Atendimento
          </h1>
          <p>Gerenciamento de senhas e filas para unidades de saúde.</p>
          <div className={styles.heroDots}>
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>

      {/* ── Painel de login ── */}
      <div className={styles.side}>
        <div className={styles.panel}>
          {/* brand só no mobile */}
          <div className={styles.mobileBrand}>
            <div className={styles.brandMark}>S</div>
            <div>
              <strong>Central de Atendimento</strong>
              <span>Sistema de Senhas</span>
            </div>
          </div>

          <h2 className={styles.panelTitle}>Entrar no sistema</h2>
          <p className={styles.panelSub}>
            Digite suas credenciais para continuar.
          </p>

          <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
            <label>
              Usuário
              <input
                type="text"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="nome.sobrenome"
                autoComplete="username"
                autoFocus
                required
              />
            </label>

            <label>
              Senha
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </label>

            {error && <div className={styles.errorBox}>{error}</div>}

            <button type="submit" disabled={loading}>
              <LockKeyhole size={17} />
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
