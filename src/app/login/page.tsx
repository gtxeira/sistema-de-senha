'use client';

import type { AuthSessionBody } from '@/shared/types/api';

import { LockKeyhole } from 'lucide-react';
import { signIn } from 'next-auth/react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import brandIcon from '@/app/icon.ico';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { readJson } from '@/shared/json';
import { useSessionStore } from '@/stores/use-session-store';

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        password,
        redirect: false,
        username: login,
      });

      if (result?.error) {
        throw new Error('Usuário ou senha inválidos.');
      }

      // Busca a sessão estabelecida pelo Auth.js e espelha os claims
      // (permissões/setor) no snapshot local usado pelos guards de tela.
      const res = await fetch('/api/auth/session');
      const session = await readJson<AuthSessionBody>(res);

      if (session?.user) {
        // Publica a sessão na store (e no espelho local) — é o que os
        // guards de tela e os filtros de UI leem.
        useSessionStore.getState().setUser(session.user);

        // Emite o refresh token (12h) junto com o login — é ele que permite
        // "acordar" a sessão após 15min de idle sem digitar a senha de novo.
        await fetch('/api/auth/refresh', { method: 'POST' }).catch(() => {});
      }

      router.push('/home');
    } catch (error_) {
      setError(
        error_ instanceof Error && error_.message
          ? error_.message
          : 'Usuário ou senha inválidos.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh">
      {/* ── Hero ── */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[linear-gradient(160deg,#061e32_0%,#0b3555_45%,#0e5070_100%)] px-12 py-[60px] before:absolute before:-top-30 before:-right-25 before:size-[480px] before:rounded-full before:bg-white before:opacity-[0.07] before:content-[''] after:absolute after:-bottom-20 after:-left-15 after:size-[300px] after:rounded-full after:bg-white after:opacity-[0.07] after:content-[''] max-md:hidden">
        <div className="relative z-1 max-w-[380px] text-white">
          <div className="mb-[15px] size-16 overflow-hidden">
            <Image
              src={brandIcon}
              alt="Logo"
              priority
              className="size-full object-contain"
            />
          </div>
          <h1 className="mb-4 text-[clamp(32px,4vw,48px)] leading-[1.15] font-black text-white">
            Sistema de
            <br />
            Atendimento
          </h1>
          <p className="text-[15px] leading-[1.6] text-[#8eb8cc]">
            Gerenciamento de senhas e filas para unidades de saúde.
          </p>
          <div className="mt-10 flex gap-2">
            <span className="size-2 rounded-full bg-[#1678a0]" />
            <span className="size-2 rounded-full bg-[#1678a0] opacity-60" />
            <span className="size-2 rounded-full bg-[#1678a0] opacity-30" />
          </div>
        </div>
      </div>

      {/* ── Painel de login ── */}
      <div className="flex w-[min(480px,100%)] items-center justify-center bg-[#f4f8fb] px-8 py-10 max-md:min-h-dvh max-md:w-full max-md:bg-[linear-gradient(160deg,#061e32_0%,#0b3555_100%)] max-md:px-6">
        <div className="w-full max-w-[360px]">
          {/* brand só no mobile */}
          <div className="mb-8 hidden items-center gap-3 max-md:flex">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#1678a0] text-[22px] font-black text-white">
              S
            </div>
            <div>
              <strong className="block text-[15px] font-extrabold text-white">
                Central de Atendimento
              </strong>
              <span className="text-[11px] text-white/50">
                Sistema de Senhas
              </span>
            </div>
          </div>

          <h2 className="mb-1.5 text-2xl/normal font-black text-[#0d2d47] max-md:text-white">
            Entrar no sistema
          </h2>
          <p className="mb-7 text-[13px] text-[#7a9aad] max-md:text-[#8eb8cc]">
            Digite suas credenciais para continuar.
          </p>

          <form className="grid gap-4" onSubmit={(e) => void handleSubmit(e)}>
            <FieldGroup className="gap-4">
              <Field className="gap-[7px]">
                <FieldLabel
                  htmlFor="login"
                  className="text-[11px] leading-normal font-bold tracking-[0.5px] text-[#416477] uppercase max-md:text-[#8eb8cc]"
                >
                  Usuário
                </FieldLabel>
                <Input
                  id="login"
                  type="text"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder="nome.sobrenome"
                  autoComplete="username"
                  className="h-10"
                  autoFocus
                  required
                />
              </Field>

              <Field className="gap-[7px]">
                <FieldLabel
                  htmlFor="password"
                  className="text-[11px] leading-normal font-bold tracking-[0.5px] text-[#416477] uppercase max-md:text-[#8eb8cc]"
                >
                  Senha
                </FieldLabel>

                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="h-10"
                  required
                />
              </Field>
            </FieldGroup>

            {error && (
              <Alert
                variant="destructive"
                className="rounded-[7px] px-3.5 py-2.75 text-xs/normal font-semibold"
              >
                {error}
              </Alert>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="mt-1 h-auto w-full rounded-[9px] px-2.5 py-3.75 text-sm/normal font-extrabold shadow-[0_4px_16px_rgba(2,132,199,0.3)]"
            >
              <LockKeyhole data-icon="inline-start" />
              {loading ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
