import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  refreshSession,
  startSessionRefresh,
} from '@/client/session/session-refresh';

/**
 * Regressão do "too much recursion": o interceptor instalava
 * `window.fetch` e o próprio código chamava o global (já envolvido) —
 * fetchWithRefreshRetry → fetch → fetchWithRefreshRetry → …
 * RangeError no navegador e, no signIn, navegação para /api/auth/error.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Rota devolve a `Response` pronta ou uma função que a monta sob demanda. */
type RouteEntry = Response | (() => Response);

/** Substitui window.fetch por um router em memória que registra as URLs. */
function installNet(routes: Record<string, RouteEntry>) {
  const calls: string[] = [];
  const net = vi.fn(async (input: RequestInfo | URL) => {
    const url =
      typeof input === 'string'
        ? input
        : ('url' in input
          ? input.url
          : String(input));
    calls.push(url);
    const handler = routes[url];
    if (!handler) return jsonResponse({ notFound: true }, 404);
    return typeof handler === 'function' ? handler() : handler;
  });
  window.fetch = net;
  return { net, calls };
}

const SESSION_ROUTES = {
  '/api/auth/refresh': jsonResponse({ ok: true }),
  '/api/auth/session': jsonResponse({ user: { id: 'u1' } }),
};

let cleanup: (() => void) | null = null;

afterEach(() => {
  cleanup?.();
  cleanup = null;
});

describe('session-refresh — interceptor de fetch', () => {
  it('chama o fetch real uma única vez (sem recursão)', async () => {
    const { net } = installNet({
      ...SESSION_ROUTES,
      '/api/qualquer': jsonResponse({ ok: true }),
    });

    cleanup = startSessionRefresh();
    // aguarda o refresh imediato do start (single-flight)
    await refreshSession();
    net.mockClear();

    // No bug antigo isto estourava RangeError: "too much recursion"
    const res = await window.fetch('/api/qualquer');

    expect(res.status).toBe(200);
    expect(net).toHaveBeenCalledTimes(1);
  });

  it('401 refresh_required: renova a sessão e repete a chamada', async () => {
    let dataCalls = 0;
    const { calls } = installNet({
      ...SESSION_ROUTES,
      '/api/dados': () => {
        dataCalls += 1;
        return dataCalls === 1
          ? jsonResponse({ error: 'x', code: 'refresh_required' }, 401)
          : jsonResponse({ ok: true });
      },
    });

    cleanup = startSessionRefresh();
    await refreshSession();
    calls.length = 0;

    const res = await window.fetch('/api/dados');

    expect(res.status).toBe(200);
    expect(calls).toEqual([
      '/api/dados',
      '/api/auth/refresh',
      '/api/auth/session',
      '/api/dados',
    ]);
  });

  it('falha no refresh devolve o 401 original (sem loop de retry)', async () => {
    let refreshCalls = 0;
    let dataCalls = 0;
    const { net } = installNet({
      '/api/auth/refresh': () => {
        refreshCalls += 1;
        // o refresh do start funciona; o do interceptor falha
        return refreshCalls === 1
          ? jsonResponse({ ok: true })
          : jsonResponse({ error: 'x', code: 'session_expired' }, 401);
      },
      '/api/auth/session': jsonResponse({ user: { id: 'u1' } }),
      '/api/dados': () => {
        dataCalls += 1;
        return jsonResponse({ error: 'x', code: 'session_expired' }, 401);
      },
    });

    cleanup = startSessionRefresh();
    await refreshSession();
    net.mockClear();

    const res = await window.fetch('/api/dados');

    expect(res.status).toBe(401);
    expect(dataCalls).toBe(1); // uma única tentativa
  });

  it('/api/auth/* nunca passa pelo retry (sem reentrada no refresh)', async () => {
    const { calls } = installNet({
      '/api/auth/refresh': jsonResponse({ ok: true }),
      '/api/auth/session': jsonResponse({ error: 'no' }, 401),
    });

    cleanup = startSessionRefresh();
    await refreshSession();
    calls.length = 0;

    const res = await window.fetch('/api/auth/session');

    expect(res.status).toBe(401);
    // nem a chamada de dados nem um refresh extra — o interceptor saiu cedo
    expect(calls).toEqual(['/api/auth/session']);
  });

  it('start duplo não re-instala; cleanup remove o interceptor', async () => {
    const { net, calls } = installNet({
      ...SESSION_ROUTES,
      '/api/restrito': jsonResponse({ code: 'refresh_required' }, 401),
    });

    cleanup = startSessionRefresh();
    const cleanup2 = startSessionRefresh(); // noop (started)
    await refreshSession();
    net.mockClear();

    await window.fetch('/api/x');
    expect(net).toHaveBeenCalledTimes(1); // wrapper único

    cleanup();
    cleanup2();
    cleanup = null;

    // fetch restaurado: um 401 com código de refresh NÃO dispara mais
    // refresh+retry (o interceptor saiu de cena)
    net.mockClear();
    calls.length = 0;
    const res = await window.fetch('/api/restrito');
    expect(res.status).toBe(401);
    expect(calls).toEqual(['/api/restrito']);
  });
});
