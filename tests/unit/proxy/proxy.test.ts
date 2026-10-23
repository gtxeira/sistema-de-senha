import { describe, expect, it, vi } from 'vitest';
import { ALL_PERMISSIONS, SECTORS_VIEW_ALL } from '@/shared/permissions';
import { REFRESH_COOKIE_NAME } from '@/shared/constants';
import type { Permission } from '@/shared/permissions';

/**
 * Request falsa que o proxy lê: `nextUrl`, `url`, `cookies` e o `auth` que o
 * mock abaixo injeta.
 */
interface ProxyRequest {
  nextUrl: URL;
  url: string;
  cookies: { get(name: string): { value: string } | undefined };
  auth?: { user?: unknown } | null;
}

/**
 * O `auth()` real do next-auth v5 devolve o handler de **duas** assinaturas
 * (req, ctx) — o mock de `vi.mock` abaixo devolve (req) => Response, que é o
 * que o teste exercita. A conversão mora só no ponto de importação para o
 * resto do arquivo ficar sem casts.
 */
type ProxyHandler = (req: ProxyRequest) => Response;

// Mock auth() pass-through: o valor do cookie de sessão É o JSON do usuário,
// então cada teste monta a sessão que quiser (permissões, setor, frescor).
vi.mock('@/auth', () => ({
  SESSION_COOKIE_NAME: 'authjs.session-token',
  auth:
    (fn: (req: ProxyRequest) => Response) =>
    (req: ProxyRequest): Response => {
      const sessionCookie = req.cookies?.get?.('authjs.session-token')?.value;
      req.auth = sessionCookie ? { user: JSON.parse(sessionCookie) } : null;
      return fn(req);
    },
}));

// Import the default export (auth-wrapped proxy)
const { default: proxy } = (await import('@/proxy')) as unknown as {
  default: ProxyHandler;
};

/** Sessão recém-emitida — claims de frescor dentro da janela. */
interface FreshUser {
  readonly id: string;
  readonly name: string;
  readonly sector: string;
  readonly permissions: Permission[];
  readonly authAt: number;
  readonly permsAt: number;
}

function freshUser(overrides: Partial<FreshUser> = {}): FreshUser {
  const now = Date.now();
  return {
    id: 'u1',
    name: 'Teste',
    sector: 'farmacia',
    permissions: [...ALL_PERMISSIONS],
    authAt: now,
    permsAt: now,
    ...overrides,
  };
}

function makeRequest(
  pathname: string,
  user?: object | null,
  refreshToken?: string,
): ProxyRequest {
  const url = `http://localhost${pathname}`;
  const cookies: Record<string, { value: string }> = {};
  if (user !== undefined && user !== null) {
    cookies['authjs.session-token'] = { value: JSON.stringify(user) };
  }
  if (refreshToken) {
    cookies[REFRESH_COOKIE_NAME] = { value: refreshToken };
  }
  return {
    nextUrl: Object.assign(new URL(url), { pathname }),
    url,
    cookies: {
      get: (name) => cookies[name],
    },
  };
}

function locationHeader(res: Response): string | null {
  return res.headers.get('location');
}

describe('proxy', () => {
  it('deixa a raiz passar (quem decide é o server component da home)', () => {
    const res = proxy(makeRequest('/', freshUser()));
    expect(locationHeader(res)).toBeNull();
  });

  it('ignora rotas estáticas e _next', () => {
    const res = proxy(makeRequest('/_next/static/chunk.js'));
    expect(locationHeader(res)).toBeNull();

    const api = proxy(makeRequest('/api/anything'));
    expect(locationHeader(api)).toBeNull();
  });

  it('ignora qualquer pathname que contenha ponto (estáticos)', () => {
    for (const p of [
      '/logo.png',
      '/favicon.ico',
      '/manifest.json',
      '/home/arquivo.css',
    ]) {
      const res = proxy(makeRequest(p));
      expect(locationHeader(res)).toBeNull();
    }
  });

  it('deixa rotas públicas passarem', () => {
    const res = proxy(makeRequest('/login'));
    expect(locationHeader(res)).toBeNull();
  });

  it('autenticado indo para /login é levado para /home', () => {
    const res = proxy(makeRequest('/login', freshUser()));
    expect(locationHeader(res)).toMatch(/\/home$/);
  });

  it('permite rota protegida com sessão autenticada', () => {
    const res = proxy(makeRequest('/home', freshUser()));
    expect(locationHeader(res)).toBeNull();
  });

  it('redireciona rota protegida sem sessão para /login', () => {
    const res = proxy(makeRequest('/home'));
    expect(res.status).toBe(307);
    expect(locationHeader(res)).toMatch(/\/login$/);
  });

  it('sem sessão mas com refresh token, tenta acordar a sessão', () => {
    const res = proxy(makeRequest('/painel', null, 'refresh-opaco'));
    expect(locationHeader(res)).toContain('/api/auth/refresh');
    expect(locationHeader(res)).toContain(encodeURIComponent('/painel'));
  });

  it('redireciona rotas desconhecidas para /login', () => {
    const res = proxy(makeRequest('/qualquer-outra', freshUser()));
    expect(locationHeader(res)).toMatch(/\/login$/);
  });

  it('rota desconhecida sem sessão também vai para /login', () => {
    const res = proxy(makeRequest('/qualquer-outra'));
    expect(locationHeader(res)).toMatch(/\/login$/);
  });

  // Regressão: rota não registrada não pode passar pelo refresh — a rota
  // de refresh devolveria o browser para a mesma URL e o proxy repetiria
  // o ciclo (ERR_TOO_MANY_REDIRECTS).
  it('rota desconhecida não tenta o refresh (evita loop de redirect)', () => {
    const res = proxy(
      makeRequest('/qualquer-outra', freshUser(), 'refresh-opaco'),
    );
    expect(locationHeader(res)).toMatch(/\/login$/);
    expect(locationHeader(res)).not.toContain('/api/auth/refresh');
  });

  it('protege /admin e /monitor', () => {
    for (const p of ['/admin', '/monitor/farmacia']) {
      const res = proxy(makeRequest(p));
      expect(locationHeader(res)).toMatch(/\/login$/);
    }
  });
});

describe('proxy — frescor da sessão (auth_at / perms_at)', () => {
  it('permissões stale dispara refresh', () => {
    const res = proxy(
      makeRequest(
        '/home',
        freshUser({ permsAt: Date.now() - 16 * 60 * 1000 }),
        'refresh-opaco',
      ),
    );
    expect(locationHeader(res)).toContain('/api/auth/refresh');
    expect(locationHeader(res)).toContain(encodeURIComponent('/home'));
  });

  it('sessão além de 12h sem refresh cookie vai para /login', () => {
    const res = proxy(
      makeRequest(
        '/home',
        freshUser({ authAt: Date.now() - 13 * 60 * 60 * 1000 }),
      ),
    );
    expect(locationHeader(res)).toMatch(/\/login$/);
  });

  it('token legado sem claims de frescor é tratado como expirado', () => {
    const res = proxy(makeRequest('/home', { id: 'u1', name: 'Legado' }));
    expect(locationHeader(res)).toMatch(/\/login$/);
  });

  // Regressão: cookie de sessão antigo (pré-RBAC, sem authAt/permsAt e sem
  // refresh cookie) em /login redirecionava para /login — loop infinito no
  // navegador (ERR_TOO_MANY_REDIRECTS) que impedia qualquer acesso.
  it('/login com sessão stale SEM refresh cookie renderiza (sem auto-loop)', () => {
    const res = proxy(
      makeRequest(
        '/login',
        freshUser({ permsAt: Date.now() - 16 * 60 * 1000 }),
      ),
    );
    expect(locationHeader(res)).toBeNull();
    // higiene: o cookie inválido é descartado na resposta
    expect(res.headers.get('set-cookie')).toContain('authjs.session-token');
  });

  it('/login com token legado SEM refresh cookie renderiza (sem auto-loop)', () => {
    const res = proxy(makeRequest('/login', { id: 'u1', name: 'Legado' }));
    expect(locationHeader(res)).toBeNull();
    expect(res.headers.get('set-cookie')).toContain('authjs.session-token');
  });

  it('cadeia / → /login termina mesmo com sessão stale sem refresh', () => {
    const stale = { id: 'u1', name: 'Legado' };

    // A raiz é resolvida pelo server component (que manda para /login
    // quando não há sessão válida) — o proxy só abre espaço.
    const first = proxy(makeRequest('/', stale));
    expect(locationHeader(first)).toBeNull();

    const second = proxy(makeRequest('/login', stale));
    expect(locationHeader(second)).toBeNull();
  });
});

describe('proxy — permissões de tela', () => {
  it('sem tela.admin, /admin cai para /home', () => {
    const user = freshUser({
      permissions: ALL_PERMISSIONS.filter((p) => p !== 'tela.admin'),
    });
    const res = proxy(makeRequest('/admin', user));
    expect(locationHeader(res)).toMatch(/\/home$/);
  });

  it('sem nenhuma tela, /admin cai para /login (sem loop)', () => {
    const user = freshUser({ permissions: [] });
    const res = proxy(makeRequest('/admin', user));
    expect(locationHeader(res)).toMatch(/\/login$/);
  });

  it('sem tela.painel, /painel é negado', () => {
    const user = freshUser({
      permissions: ALL_PERMISSIONS.filter((p) => p !== 'tela.painel'),
    });
    const res = proxy(makeRequest('/painel', user));
    expect(locationHeader(res)).toMatch(/\/home$/);
  });

  it('sessão stale no /login tenta o refresh antes de renderizar', () => {
    const res = proxy(
      makeRequest(
        '/login',
        freshUser({ permsAt: Date.now() - 16 * 60 * 1000 }),
        'refresh-opaco',
      ),
    );
    expect(locationHeader(res)).toContain('/api/auth/refresh');
  });
});

describe('proxy — escopo de setor em /monitor', () => {
  it('atendente vê o monitor do PRÓPRIO setor', () => {
    const user = freshUser({
      sector: 'farmacia',
      permissions: ['tela.monitor'],
    });
    const res = proxy(makeRequest('/monitor/farmacia', user));
    expect(locationHeader(res)).toBeNull();
  });

  it('atendente NÃO vê o monitor de OUTRO setor', () => {
    const user = freshUser({
      sector: 'farmacia',
      permissions: ['tela.home', 'tela.monitor'],
    });
    const res = proxy(makeRequest('/monitor/recepcao', user));
    expect(locationHeader(res)).toMatch(/\/home$/);
  });

  it('setores.todos.ver libera qualquer monitor', () => {
    const user = freshUser({
      sector: 'farmacia',
      permissions: ['tela.monitor', SECTORS_VIEW_ALL],
    });
    const res = proxy(makeRequest('/monitor/recepcao', user));
    expect(locationHeader(res)).toBeNull();
  });
});
