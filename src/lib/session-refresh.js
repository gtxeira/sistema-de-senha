"use client";

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
 * conta desativada), o snapshot é limpo e a aba vai para /login.
 */
import { SESSION_KEY, SESSION_REFRESH_INTERVAL } from "./constants.js";
import { writeSessionSnapshot } from "./queue.js";

let inflight = null;

/** Busca a sessão do Auth.js e persiste o snapshot local. */
async function syncSessionSnapshot() {
  try {
    const res = await fetch("/api/auth/session", { cache: "no-store" });
    if (!res.ok) return false;
    const session = await res.json();
    if (session?.user?.id) {
      writeSessionSnapshot(session.user);
      return true;
    }
  } catch {
    // rede instável: deixa o próximo ciclo tentar
  }
  return false;
}

function forceLogin() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
  if (window.location.pathname !== "/login") {
    // Navegação hard intencional: helper de módulo (sem acesso a useRouter) e
    // queremos descartar todo o estado da aba ao perder a sessão.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }
}

/**
 * POST /api/auth/refresh (single-flight): rotaciona o refresh token no
 * servidor e regrava o snapshot com as permissões atualizadas.
 * @returns {Promise<boolean>} true quando a sessão segue viva
 */
export function refreshSession() {
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", { method: "POST" });
      if (res.ok) {
        await syncSessionSnapshot();
        return true;
      }
      const data = await res.json().catch(() => ({}));
      // Corrida: outro fluxo do mesmo cliente renovou primeiro — a sessão
      // está viva, só precisa reler os cookies/claims.
      if (data?.code === "refresh_conflict") {
        await syncSessionSnapshot();
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

  return inflight;
}

async function fetchWithRefreshRetry(input, init) {
  const res = await fetch(input, init);
  if (res.status !== 401) return res;

  let code = null;
  try {
    code = (await res.clone().json())?.code;
  } catch {
    return res;
  }
  if (code !== "refresh_required" && code !== "session_expired") return res;

  const renewed = await refreshSession();
  if (!renewed) return res;
  // Só uma retentativa — se falhar de novo, o 401 original volta ao caller.
  return fetch(input, init);
}

let started = false;

/**
 * Instala o intervalo + interceptor de 401. Chamar uma única vez no
 * Providers; retorna a função de cleanup.
 */
export function startSessionRefresh() {
  if (typeof window === "undefined" || started) return () => {};
  started = true;

  const intervalId = setInterval(() => {
    if (document.visibilityState === "visible") refreshSession();
  }, SESSION_REFRESH_INTERVAL);

  const onFocus = () => refreshSession();
  window.addEventListener("focus", onFocus);

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => fetchWithRefreshRetry(input, init);

  // Assim que a aba sobe, tenta acordar a sessão (ex.: TV ligada de manhã).
  refreshSession();

  return () => {
    started = false;
    clearInterval(intervalId);
    window.removeEventListener("focus", onFocus);
    window.fetch = originalFetch;
  };
}
