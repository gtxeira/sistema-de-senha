import { create } from 'zustand';
import type { User } from 'next-auth';
import { SESSION_KEY } from '@/shared/constants';
import { parseJson } from '@/shared/json';
import { hasPermission } from '@/shared/permissions';
import type { Permission } from '@/shared/permissions';

/**
 * Fonte única da sessão no cliente.
 *
 * Antes a sessão vivia em três lugares ao mesmo tempo: o snapshot no
 * `localStorage` (`src/client/queue/queue.ts`), o `useSyncExternalStore` de cada
 * página e o `SessionProvider` do next-auth (montado e nunca usado). Esta
 * store junta os três em um só estado, com os hooks de leitura derivados.
 *
 * Duas regras que sustentam o desenho:
 *
 * 1. **A store não é fronteira de segurança.** Ela espelha as claims que já
 *    estão no cookie httpOnly — serve à UI (esconder botões, filtrar
 *    menus), nunca autoriza. Quem autoriza é o `proxy.ts` (páginas) e o
 *    `requirePermission()` das rotas de API.
 * 2. **O estado inicial é `null` no servidor e no cliente.** A store é
 *    semeada num efeito (em `src/app/providers.tsx`), e não na
 *    inicialização do módulo: semear no module init faria o primeiro
 *    render do client diferir do HTML do servidor (hydration mismatch) em
 *    todas as telas que leem a sessão. Com o efeito, o primeiro render
 *    bate com o servidor e o usuário aparece no commit seguinte — o mesmo
 *    comportamento do `useSyncExternalStore` com `getServerSnapshot` que
 *    existia antes.
 *
 * O `localStorage` continua sendo **cache** (o espelho local), nunca a
 * fonte: ele é escrito pelas actions da store e lido no bootstrap.
 */
export interface SessionState {
  /** Sessão atual — `null` enquanto não há usuário conhecido. */
  user: User | null;
  /** Grava a sessão e atualiza o cache local. */
  setUser: (user: User | null) => void;
  /** Encerra a sessão e limpa o cache local. */
  clear: () => void;
}

/**
 * Lê o espelho da sessão no `localStorage`.
 *
 * `null` fora do browser (SSR) ou quando o cache não existe/vem
 * corrompido — um cache invalido é tratado como "sem sessão", nunca como
 * um erro: a sessão real está no cookie httpOnly.
 */
export function readCachedSession(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = parseJson<Partial<User> | null>(raw);
    // O espelho só é útil com o `id` — sem ele não há usuário nenhum.
    if (!parsed?.id) return null;
    return parsed as User;
  } catch {
    return null;
  }
}

/** Grava (ou apaga) o espelho da sessão no `localStorage`. */
function writeCachedSession(user: User | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!user) {
      window.localStorage.removeItem(SESSION_KEY);
      return;
    }
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } catch {
    // Storage cheio/bloqueado: a store continua funcionando em memória.
  }
}

export const useSessionStore = create<SessionState>()((set) => ({
  user: null,

  setUser: (user) => {
    writeCachedSession(user);
    set({ user });
  },

  clear: () => {
    writeCachedSession(null);
    set({ user: null });
  },
}));

/**
 * Sincroniza entre abas.
 *
 * O evento `storage` do navegador só dispara nas **outras** abas (a aba que
 * escreveu não recebe) — por isso a store também escreve o cache nas suas
 * próprias actions, e aqui só se reage ao que veio de fora.
 *
 * O filtro por `key` evita o cruzamento que existia antes: o snapshot de
 * sessão usava o evento `storage` sem olhar a chave, então uma mudança em
 * qualquer outra chave (a fila, por exemplo) acordava os assinantes da
 * sessão — e vice-versa.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== SESSION_KEY) return;
    useSessionStore.setState({ user: readCachedSession() });
  });
}

/* ── hooks ──────────────────────────────────────────────────────── */

/** A sessão atual (`null` = anônimo). */
export function useSession(): User | null {
  return useSessionStore((state) => state.user);
}

/**
 * O usuário tem a permissão?
 *
 * Para quando a tela só precisa do *sim/não* — assinar a flag em vez do
 * usuário inteiro evita re-renderizar quando muda algo da sessão que não
 * interfere na decisão.
 */
export function useCan(permission: Permission): boolean {
  return useSessionStore((state) => hasPermission(state.user, permission));
}
