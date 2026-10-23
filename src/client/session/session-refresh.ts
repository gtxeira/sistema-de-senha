'use client';

/**
 * Renovação da sessão de curta duração no client (apenas navegador).
 *
 * Três gatilhos alimentam o mesmo fluxo single-flight (`refreshSession`):
 *  1. intervalo proativo (~10min) enquanto a aba está visível — mantém o
 *     access token (15min) e o `perms_at` frescos sem depender de erro;
 *  2. foco na janela — acorda abas de monitor/PDV que ficaram dormentes;
 *  3. interceptor de fetch — quando uma API devolve 401 `refresh_required`
 *     (permissões stale) ou `session_expired`, renova e repete a chamada.
 *
 * Se o refresh falhar de vez (janela de 12h do refresh token encerrada,
 * conta desativada), a store é limpa e a aba vai para /login.
 */
import { SESSION_REFRESH_INTERVAL } from '@/shared/constants';
import { readJson } from '@/shared/json';
import { useSessionStore } from '@/stores/use-session-store';
import type { ApiErrorBody, AuthSessionBody } from '@/shared/types/api';

let inflight: Promise<boolean> | null = null;

// Fetch real, capturado ANTES de instalar o interceptor. Todo código interno
// usa `netFetch` — chamar o global depois do wrap faria
// fetchWithRefreshRetry → fetch(envolvido) → fetchWithRefreshRetry → …
// (RangeError "too much recursion" e, no signIn, navegação para
// /api/auth/error).
let originalFetch: typeof fetch | null = null;

function netFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return (originalFetch ?? globalThis.fetch)(input, init);
}

/** Busca a sessão do Auth.js e publica na store. */
async function syncSession(): Promise<boolean> {
  try {
    const res = await netFetch('/api/auth/session', { cache: 'no-store' });
    if (!res.ok) return false;
    const session = await readJson<AuthSessionBody>(res);
    if (session?.user?.id) {
      useSessionStore.getState().setUser(session.user);
      return true;
    }
  } catch {
    // rede instável: deixa o próximo ciclo tentar
  }
  return false;
}

function forceLogin(): void {
  if (typeof window === 'undefined') return;
  // Limpa a store (e o espelho local) antes de sair: a sessão morta não
  // pode continuar authorizing a UI.
  useSessionStore.getState().clear();
  if (window.location.pathname !== '/login') {
    // Navegação hard intencional: helper de módulo (sem acesso a useRouter) e
    // queremos descartar todo o estado da aba ao perder a sessão.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/login');
  }
}

/**
 * POST /api/auth/refresh (single-flight): rotaciona o refresh token no
 * servidor e regrava o snapshot com as permissões atualizadas.
 * @returns true quando a sessão segue viva
 */
export function refreshSession(): Promise<boolean> {
  if (inflight) return inflight;

  const run: Promise<boolean> = (async () => {
    try {
      const res = await netFetch('/api/auth/refresh', { method: 'POST' });
      if (res.ok) {
        await syncSession();
        return true;
      }
      const data = await readJson<ApiErrorBody>(res).catch<ApiErrorBody>(
        () => ({}),
      );
      // Corrida: outro fluxo do mesmo cliente renovou primeiro — a sessão
      // está viva, só precisa reler os cookies/claims.
      if (data?.code === 'refresh_conflict') {
        await syncSession();
        return true;
      }
      forceLogin();
      return false;
    } catch {
      // Erro de rede não é fim de sessão — mantém o estado atual.
      return true;
    } finally {
      inflight = null;
    }
  })();

  inflight = run;
  return run;
}

async function fetchWithRefreshRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  // `Request` tem `.url`; `URL` não — a checagem `in` estreita a união e
  // preserva o comportamento original (`input?.url ?? input`).
  const url =
    typeof input === 'string'
      ? input
      : String(('url' in input ? input.url : input) ?? '');
  const res = await netFetch(input, init);
  if (res.status !== 401) return res;

  // Rotas de sessão do Auth.js não passam pelo retry: elas mesmas renovam a
  // sessão, e o interceptor reentraria em refreshSession — o single-flight
  // devolveria a própria promise em curso (deadlock).
  if (url.includes('/api/auth/')) return res;

  let code: string | null = null;
  try {
    code = (await readJson<ApiErrorBody>(res.clone())).code ?? null;
  } catch {
    return res;
  }
  if (code !== 'refresh_required' && code !== 'session_expired') return res;

  const renewed = await refreshSession();
  if (!renewed) return res;
  // Só uma retentativa — se falhar de novo, o 401 original volta ao caller.
  return netFetch(input, init);
}

let started = false;

/**
 * Instala o intervalo + interceptor de 401. Chamar uma única vez no
 * Providers; retorna a função de cleanup.
 */
export function startSessionRefresh(): () => void {
  if (typeof window === 'undefined' || started) return () => {};
  started = true;

  const intervalId = window.setInterval(() => {
    if (document.visibilityState === 'visible') void refreshSession();
  }, SESSION_REFRESH_INTERVAL);

  const onFocus = () => void refreshSession();
  window.addEventListener('focus', onFocus);

  const original = window.fetch.bind(window);
  originalFetch = original;
  window.fetch = (input, init) => fetchWithRefreshRetry(input, init);

  // Assim que a aba sobe, tenta acordar a sessão (ex.: TV ligada de manhã).
  void refreshSession();

  return () => {
    started = false;
    window.clearInterval(intervalId);
    window.removeEventListener('focus', onFocus);
    window.fetch = original;
  };
}
