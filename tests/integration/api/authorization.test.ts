import type { Session } from 'next-auth';
import type { Permission } from '@/shared/permissions';
import type {
  ApiErrorBody,
  RoleSaveBody,
  RolesListBody,
  UserSaveBody,
} from '@/shared/types/api';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { eventManager } from '@/server/realtime/event-manager';
import { MAX_SSE_CONNECTIONS_PER_SECTOR, SECTORS } from '@/shared/constants';
import { readJson } from '@/shared/json';
import {
  ALL_PERMISSIONS,
  NEWS_CREATE,
  NEWS_DELETE,
  QUEUE_CALL,
  QUEUE_RECALL,
  QUEUE_RESET,
  QUEUE_SYNC,
  ROLES_MANAGE,
  SECTORS_MANAGE_ALL,
  SECTORS_VIEW_ALL,
  USERS_CREATE,
  USERS_DELETE,
  USERS_EDIT,
  USERS_VIEW,
} from '@/shared/permissions';
import { authMock } from '../../helpers/auth-mock';
import { cleanupAllTestUsers, seedTestUser } from '../postgres-setup';

/**
 * Handler de rota. `request` é opcional na assinatura porque há `GET` sem
 * parâmetro (ex.: `GET /api/roles`) convivendo com os que leem a request.
 */
type RouteHandler = (request?: RouteRequest) => Promise<Response>;

/** Métodos que um `route.ts` pode exportar. */
type RouteMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST';

/** Módulo de rota: só os métodos que ele de fato exporta. */
type RouteModule = Partial<Record<RouteMethod, RouteHandler>>;

/**
 * Monta uma sessão com claims frescos. `permissions` default: vazio
 * (autenticado sem nenhuma permissão) — cada teste concede o que precisa.
 */
type SessionOverrides = Partial<Session['user']>;

/**
 * Superfície de `Request` que os handlers de rota leem.
 *
 * `req()` monta este objeto — e não um `Request` real — porque a matriz chama
 * o mesmo handler para rotas de leitura e de escrita com corpo JSON, e um
 * `Request` real com corpo rejeita `formData()` antes de a rota ver a sessão.
 */
interface RouteRequest {
  readonly url: string;
  formData(): Promise<FormData>;
  json(): Promise<unknown>;
  readonly signal: {
    addEventListener(type: string, listener: (event: unknown) => void): void;
  };
}

function asAnonymous() {
  authMock.mockResolvedValue(null);
}

function asSession(overrides: SessionOverrides = {}) {
  authMock.mockResolvedValue(session(overrides));
}

function req(
  url: string,
  extra: { readonly body?: unknown; readonly formData?: FormData } = {},
) {
  return {
    formData: () => Promise.resolve(extra.formData ?? new FormData()),
    json: () => Promise.resolve(extra.body ?? {}),
    signal: { addEventListener: vi.fn() },
    url,
  };
}

/**
 * Importa a rota (specifier dinâmico na `MATRIX`, literal nos demais casos) e
 * devolve o handler do método testado.
 *
 * `import(<variável>)` não é resolvido pelo TypeScript e devolve
 * `Promise<any>` — o `unknown` + `as` abaixo é a **única** conversão `any`
 * deste arquivo, e é onde o contrato das rotas fica declarado.
 */
async function routeHandler(
  specifier: string,
  method: RouteMethod,
): Promise<RouteHandler> {
  const mod: unknown = await import(specifier);
  const handler = (mod as RouteModule)[method];
  if (!handler) throw new Error(`${specifier} não exporta ${method}`);
  return handler;
}

function session(overrides: SessionOverrides = {}): Session {
  const now = Date.now();
  return {
    expires: new Date(now + 600000).toISOString(),
    user: {
      id: 'u1',
      name: 'Teste',
      authAt: now,
      email: 'teste@local',
      guiche: 'none',
      permissions: [],
      permsAt: now,
      sector: 'farmacia',
      ...overrides,
    },
  };
}

const FULL = [...ALL_PERMISSIONS];

/**
 * Matriz de autorização das rotas de API.
 *
 * `proxy.js` libera todo `/api`, então cada handler precisa se proteger
 * sozinho — esta é a rede de segurança contra regressões nessa barreira.
 * A autorização é por PERMISSÃO (registro em src/shared/permissions.ts), não
 * mais por cargo.
 */
describe('Autorização das rotas de API', () => {
  beforeEach(() => {
    eventManager.removeAllListeners();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Rota, método e permissão exigida (null = qualquer sessão fresca basta)
  const MATRIX: ReadonlyArray<{
    readonly method: RouteMethod;
    readonly path: string;
    readonly permission: Permission | null;
  }> = [
    {
      method: 'GET',
      path: '@/app/api/queue/events/route.ts',
      permission: null,
    },
    {
      method: 'GET',
      path: '@/app/api/queue/recent/route.ts',
      permission: null,
    },
    {
      method: 'POST',
      path: '@/app/api/queue/call/route.ts',
      permission: QUEUE_CALL,
    },
    {
      method: 'POST',
      path: '@/app/api/queue/recall/route.ts',
      permission: QUEUE_RECALL,
    },
    {
      method: 'POST',
      path: '@/app/api/queue/reset/route.ts',
      permission: QUEUE_RESET,
    },
    {
      method: 'POST',
      path: '@/app/api/queue/sync/route.ts',
      permission: QUEUE_SYNC,
    },
    { method: 'GET', path: '@/app/api/news/route.ts', permission: null },
    {
      method: 'POST',
      path: '@/app/api/news/route.ts',
      permission: NEWS_CREATE,
    },
    {
      method: 'DELETE',
      path: '@/app/api/news/route.ts',
      permission: NEWS_DELETE,
    },
    { method: 'GET', path: '@/app/api/users/route.ts', permission: USERS_VIEW },
    {
      method: 'POST',
      path: '@/app/api/users/route.ts',
      permission: USERS_CREATE,
    },
    {
      method: 'PATCH',
      path: '@/app/api/users/route.ts',
      permission: USERS_EDIT,
    },
    {
      method: 'DELETE',
      path: '@/app/api/users/route.ts',
      permission: USERS_DELETE,
    },
    { method: 'GET', path: '@/app/api/roles/route.ts', permission: USERS_VIEW },
    {
      method: 'POST',
      path: '@/app/api/roles/route.ts',
      permission: ROLES_MANAGE,
    },
    {
      method: 'PATCH',
      path: '@/app/api/roles/route.ts',
      permission: ROLES_MANAGE,
    },
    {
      method: 'DELETE',
      path: '@/app/api/roles/route.ts',
      permission: ROLES_MANAGE,
    },
    { method: 'GET', path: '@/app/api/stats/route.ts', permission: null },
  ];

  const url = 'http://localhost/api/queue/recent?sector=farmacia&limit=1';

  for (const { method, path, permission } of MATRIX) {
    const name = `${path.replace('@/app', '')} ${method}`;

    describe(name, () => {
      it('sem sessão devolve 401', async () => {
        asAnonymous();
        const handler = await routeHandler(path, method);
        const res = await handler(req(url, { body: { sector: 'farmacia' } }));

        expect(res.status).toBe(401);
      });

      if (permission) {
        it('sessão sem a permissão devolve 403', async () => {
          asSession();
          const handler = await routeHandler(path, method);
          const res = await handler(req(url, { body: { sector: 'farmacia' } }));

          expect(res.status).toBe(403);
        });
      }

      it('sessão com a permissão (e escopo) passa da autorização', async () => {
        asSession({ permissions: FULL });
        const handler = await routeHandler(path, method);
        const res = await handler(req(url, { body: { sector: 'farmacia' } }));

        expect(res.status).not.toBe(401);
        expect(res.status).not.toBe(403);
      });
    });
  }
});

describe('Frescor da sessão (auth_at / perms_at)', () => {
  beforeEach(() => {
    eventManager.removeAllListeners();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const url = 'http://localhost/api/queue/recent?sector=farmacia&limit=1';

  it('permissões stale (>15min) devolve 401 refresh_required', async () => {
    const GET = await routeHandler('@/app/api/queue/recent/route.ts', 'GET');
    authMock.mockResolvedValue(
      session({
        permissions: FULL,
        permsAt: Date.now() - 16 * 60 * 1000,
      }),
    );

    const res = await GET(req(url));

    expect(res.status).toBe(401);
    expect((await readJson<ApiErrorBody>(res)).code).toBe('refresh_required');
  });

  it('sessão além do teto absoluto (12h) devolve 401 session_expired', async () => {
    const GET = await routeHandler('@/app/api/queue/recent/route.ts', 'GET');
    authMock.mockResolvedValue(
      session({
        authAt: Date.now() - 13 * 60 * 60 * 1000,
        permissions: FULL,
        // perms_at novo, mas auth_at vencido manda primeiro
        permsAt: Date.now(),
      }),
    );

    const res = await GET(req(url));

    expect(res.status).toBe(401);
    expect((await readJson<ApiErrorBody>(res)).code).toBe('session_expired');
  });

  it('token antigo sem claims de frescor é tratado como expirado', async () => {
    const GET = await routeHandler('@/app/api/queue/recent/route.ts', 'GET');
    authMock.mockResolvedValue({
      user: { id: 'u1', name: 'Legado', permissions: FULL },
    });

    const res = await GET(req(url));

    expect(res.status).toBe(401);
    expect((await readJson<ApiErrorBody>(res)).code).toBe('session_expired');
  });
});

describe('Escopo de setor', () => {
  beforeEach(() => {
    eventManager.removeAllListeners();
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await cleanupAllTestUsers();
  });

  // Atendente baseline do seed: telas próprias + chamar/repetir
  const ATTENDANT: Permission[] = [
    'tela.home',
    'tela.painel',
    'tela.historico',
    'tela.monitor',
    QUEUE_CALL,
    QUEUE_RECALL,
  ];

  it('atendente opera a fila do PRÓPRIO setor', async () => {
    const POST = await routeHandler('@/app/api/queue/recall/route.ts', 'POST');
    authMock.mockResolvedValue(
      session({ permissions: ATTENDANT, sector: 'farmacia' }),
    );

    const res = await POST(
      req('http://localhost/api/queue/recall', {
        body: { sector: 'farmacia' },
      }),
    );

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('atendente NÃO opera a fila de OUTRO setor (403)', async () => {
    const POST = await routeHandler('@/app/api/queue/recall/route.ts', 'POST');
    authMock.mockResolvedValue(
      session({ permissions: ATTENDANT, sector: 'farmacia' }),
    );

    const res = await POST(
      req('http://localhost/api/queue/recall', {
        body: { sector: 'recepcao' },
      }),
    );

    expect(res.status).toBe(403);
    expect((await readJson<ApiErrorBody>(res)).code).toBe('sector_forbidden');
  });

  it('sem setor asignado e sem escopo, tudo é negado (403)', async () => {
    const POST = await routeHandler('@/app/api/queue/call/route.ts', 'POST');
    authMock.mockResolvedValue(
      session({ permissions: ATTENDANT, sector: null }),
    );

    const res = await POST(
      req('http://localhost/api/queue/call', { body: { sector: 'farmacia' } }),
    );

    expect(res.status).toBe(403);
  });

  it('permissão de escopo de escrita libera qualquer setor', async () => {
    const POST = await routeHandler('@/app/api/queue/reset/route.ts', 'POST');
    authMock.mockResolvedValue(
      session({
        permissions: [...ATTENDANT, QUEUE_RESET, SECTORS_MANAGE_ALL],
        sector: null,
      }),
    );

    const res = await POST(
      req('http://localhost/api/queue/reset', { body: { sector: 'recepcao' } }),
    );

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('reset de TODOS os setores exige escopo de escrita em todos', async () => {
    const POST = await routeHandler('@/app/api/queue/reset/route.ts', 'POST');
    authMock.mockResolvedValue(
      session({ permissions: [...ATTENDANT, QUEUE_RESET], sector: 'farmacia' }),
    );

    const res = await POST(
      req('http://localhost/api/queue/reset', { body: { sector: 'all' } }),
    );

    expect(res.status).toBe(403);
  });

  it('leitura de fila de outro setor exige setores.todos.ver', async () => {
    const GET = await routeHandler('@/app/api/queue/recent/route.ts', 'GET');
    authMock.mockResolvedValue(
      session({ permissions: ATTENDANT, sector: 'farmacia' }),
    );

    const res = await GET(
      req('http://localhost/api/queue/recent?sector=recepcao&limit=1'),
    );

    expect(res.status).toBe(403);
  });

  it('estatísticas agregadas (sem setor) exigem setores.todos.ver', async () => {
    const GET = await routeHandler('@/app/api/stats/route.ts', 'GET');

    authMock.mockResolvedValue(
      session({ permissions: ATTENDANT, sector: 'farmacia' }),
    );
    const negado = await GET(req('http://localhost/api/stats?days=7'));
    expect(negado.status).toBe(403);

    authMock.mockResolvedValue(
      session({ permissions: [...ATTENDANT, SECTORS_VIEW_ALL], sector: null }),
    );
    const permitido = await GET(req('http://localhost/api/stats?days=7'));
    expect(permitido.status).not.toBe(401);
    expect(permitido.status).not.toBe(403);
  });

  it('usuário com escopo lê e opera qualquer setor', async () => {
    const GET = await routeHandler('@/app/api/queue/recent/route.ts', 'GET');
    authMock.mockResolvedValue(
      session({ permissions: [...ATTENDANT, SECTORS_VIEW_ALL], sector: null }),
    );

    const res = await GET(
      req('http://localhost/api/queue/recent?sector=recepcao&limit=1'),
    );

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

describe('Gestão de cargos e permissões (RBAC)', () => {
  let createdRoleIds: string[] = [];
  let targetUserId: null | string = null;

  beforeEach(() => {
    eventManager.removeAllListeners();
    createdRoleIds = [];
    authMock.mockResolvedValue(session({ permissions: FULL }));
  });

  afterEach(async () => {
    vi.clearAllMocks();
    const { prisma } = await import('@/server/db/prisma-client');
    if (createdRoleIds.length) {
      await prisma.roles.deleteMany({
        where: { id: { in: createdRoleIds } },
      });
    }
    if (targetUserId) {
      await prisma.users
        .delete({ where: { id: targetUserId } })
        .catch(() => {});
      targetUserId = null;
    }
    await cleanupAllTestUsers();
  });

  it('cria cargo, lista e exclui', async () => {
    const GET = await routeHandler('@/app/api/roles/route.ts', 'GET');
    const POST = await routeHandler('@/app/api/roles/route.ts', 'POST');
    const DELETE = await routeHandler('@/app/api/roles/route.ts', 'DELETE');
    const key = `cargo-teste-${Date.now()}`;

    const created = await POST(
      req('http://localhost/api/roles', {
        body: { name: 'Cargo Teste', key, permissions: ['tela.painel'] },
      }),
    );
    expect(created.status).toBe(200);
    const { role } = await readJson<RoleSaveBody>(created);
    createdRoleIds.push(role.id);

    const list = await GET();
    expect(list.status).toBe(200);
    const body = await readJson<RolesListBody>(list);
    expect(body.roles.some((r) => r.key === key)).toBe(true);

    const removed = await DELETE(
      req(`http://localhost/api/roles?id=${role.id}`),
    );
    expect(removed.status).toBe(200);
  });

  it('cargo built-in não pode ser editado nem excluído (403)', async () => {
    const GET = await routeHandler('@/app/api/roles/route.ts', 'GET');
    const PATCH = await routeHandler('@/app/api/roles/route.ts', 'PATCH');
    const DELETE = await routeHandler('@/app/api/roles/route.ts', 'DELETE');

    const list = await GET();
    const { roles } = await readJson<RolesListBody>(list);
    const builtIn = roles.find((r) => r.key === 'admin');
    expect(builtIn?.built_in).toBe(true);

    const patched = await PATCH(
      req('http://localhost/api/roles', {
        body: { id: builtIn?.id, permissions: ['tela.painel'] },
      }),
    );
    expect(patched.status).toBe(403);

    const removed = await DELETE(
      req(`http://localhost/api/roles?id=${builtIn?.id}`),
    );
    expect(removed.status).toBe(403);
  });

  it('chave de permissão desconhecida é rejeitada (400)', async () => {
    const POST = await routeHandler('@/app/api/roles/route.ts', 'POST');

    const res = await POST(
      req('http://localhost/api/roles', {
        body: {
          name: 'X',
          key: `x.${Date.now()}`,
          permissions: ['permissao.fake'],
        },
      }),
    );

    expect(res.status).toBe(400);
  });

  it('PATCH /api/users aplica overrides de permissão (grant/deny)', async () => {
    const PATCH = await routeHandler('@/app/api/users/route.ts', 'PATCH');
    const target = await seedTestUser({
      full_name: 'Alvo RBAC',
      role: 'attendant',
      username: `test.rbac.${Date.now()}`,
    });
    targetUserId = target.id;

    const res = await PATCH(
      req('http://localhost/api/users', {
        body: {
          id: target.id,
          full_name: 'Alvo RBAC Editado',
          permissions: [
            { granted: true, permission: 'filas.resetar' },
            { granted: false, permission: 'filas.chamar' },
          ],
        },
      }),
    );

    expect(res.status).toBe(200);
    const body = await readJson<UserSaveBody>(res);
    expect(body.user.permissions).toEqual(
      expect.arrayContaining([
        { granted: true, permission: 'filas.resetar' },
        { granted: false, permission: 'filas.chamar' },
      ]),
    );
  });

  it('não é possível alterar o próprio cargo/situação (400)', async () => {
    const PATCH = await routeHandler('@/app/api/users/route.ts', 'PATCH');
    const me = await seedTestUser({
      full_name: 'Eu Mesmo',
      role: 'admin',
      username: `test.self.${Date.now()}`,
    });
    targetUserId = me.id;

    // sessão == alvo: a proteção contra auto-lockout deve recusar
    authMock.mockResolvedValue(session({ id: me.id, permissions: FULL }));

    const res = await PATCH(
      req('http://localhost/api/users', {
        body: { id: me.id, active: false },
      }),
    );

    expect(res.status).toBe(400);
  });
});

describe('/api/queue/events — limite de conexões', () => {
  beforeEach(() => {
    eventManager.removeAllListeners();
  });

  afterEach(() => {
    eventManager.removeAllListeners();
    vi.clearAllMocks();
  });

  /** O events só lê `url`/`signal`, então um `Request` real basta. */
  function streamReq(sector: string): Request {
    return new Request(`http://localhost/api/queue/events?sector=${sector}`);
  }

  it(`devolve 429 acima de ${MAX_SSE_CONNECTIONS_PER_SECTOR} conexões`, async () => {
    const GET = await routeHandler('@/app/api/queue/events/route.ts', 'GET');
    asSession({ permissions: FULL });

    // Sobe no limite.
    const unsubs: Array<() => Promise<void>> = [];
    for (let i = 0; i < MAX_SSE_CONNECTIONS_PER_SECTOR; i++) {
      const res = await GET(streamReq('farmacia'));
      expect(res.status).toBe(200);
      // O stream fica aberto; força o cleanup do teste.
      unsubs.push(() => (res.body ? res.body.cancel() : Promise.resolve()));
    }

    const rejected = await GET(streamReq('farmacia'));
    expect(rejected.status).toBe(429);

    await Promise.all(unsubs.map((fn) => fn().catch(() => {})));
  });

  it('o limite é por setor', async () => {
    const GET = await routeHandler('@/app/api/queue/events/route.ts', 'GET');
    asSession({ permissions: FULL });

    const streams: Response[] = [];
    for (let i = 0; i < MAX_SSE_CONNECTIONS_PER_SECTOR; i++) {
      const res = await GET(streamReq('farmacia'));
      streams.push(res);
    }

    // Outro setor ainda tem cota.
    const other = await GET(streamReq('recepcao'));
    expect(other.status).toBe(200);

    await Promise.all(
      streams.map((res) =>
        res.body ? res.body.cancel().catch(() => {}) : Promise.resolve(),
      ),
    );
  });

  it('sessão anônima não abre stream', async () => {
    const GET = await routeHandler('@/app/api/queue/events/route.ts', 'GET');
    asAnonymous();

    const res = await GET(streamReq('farmacia'));

    expect(res.status).toBe(401);
    expect(eventManager.getSubscriberCount('farmacia')).toBe(0);
  });

  it('recusa setor inválido antes de abrir stream', async () => {
    const GET = await routeHandler('@/app/api/queue/events/route.ts', 'GET');
    asSession({ permissions: FULL });

    const res = await GET(streamReq('inexistente'));

    expect(res.status).toBe(400);
  });

  it('todos os setores do enum continuam acessíveis', () => {
    // `Object.keys` sempre devolve `string[]`; restringe ao conjunto real
    // de chaves para `SECTORS[sector]` indexar sem `any` implícito.
    const ids = Object.keys(SECTORS) as Array<keyof typeof SECTORS>;
    for (const sector of ids) {
      expect(SECTORS[sector]).toBeDefined();
    }
  });
});
