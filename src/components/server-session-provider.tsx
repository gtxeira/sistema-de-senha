'use client';

import type { User } from 'next-auth';

import { createContext, type ReactNode, useContext } from 'react';

/**
 * Sessão do servidor, publicada na árvore via Context.
 *
 * O layout do dashboard é um **server component**: ele tem a sessão em mãos
 * (`auth()` lê o cookie httpOnly) e precisa levá-la até os componentes
 * client da árvore — a sidebar, o rodapé e as páginas.
 *
 * O Context é esse canal. Ele não substitui a store `use-session-store`:
 * a store continua sendo a fonte **no client** (é ela que renova as claims
 * quando o `/api/auth/refresh` rotaciona o token); o Context cobre o
 * primeiro paint, quando a store ainda está vazia.
 */
const ServerSessionContext = createContext<User | null>(null);

export function ServerSessionProvider({
  session,
  children,
}: {
  readonly children: ReactNode;
  /** Claims lidas do cookie no servidor; `null` = anônimo. */
  readonly session: User | null;
}) {
  return (
    <ServerSessionContext.Provider value={session}>
      {children}
    </ServerSessionContext.Provider>
  );
}

/**
 * A sessão que o servidor viu no cookie.
 *
 * `null` quando o provider não está na árvore (rotas fora do dashboard) ou
 * quando não há sessão.
 */
export function useServerSession(): User | null {
  return useContext(ServerSessionContext);
}
