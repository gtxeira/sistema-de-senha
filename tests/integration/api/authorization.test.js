import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { auth } from "@/auth";
import { eventManager } from "@/lib/event-manager";
import {
  MAX_SSE_CONNECTIONS_PER_SECTOR,
  SECTORS,
} from "@/lib/constants.js";
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
} from "@/lib/permissions.js";
import { seedTestUser, cleanupAllTestUsers } from "../postgres-setup.js";

async function importRoute(path) {
  return import(path);
}

/**
 * Monta uma sessão com claims frescos. `permissions` default: vazio
 * (autenticado sem nenhuma permissão) — cada teste concede o que precisa.
 */
function session(overrides = {}) {
  const now = Date.now();
  return {
    user: {
      id: "u1",
      name: "Teste",
      email: "teste@local",
      sector: "farmacia",
      guiche: "none",
      permissions: [],
      authAt: now,
      permsAt: now,
      ...overrides,
    },
    expires: new Date(now + 600000).toISOString(),
  };
}

function asSession(overrides) {
  auth.mockResolvedValue(session(overrides));
}

function asAnonymous() {
  auth.mockResolvedValue(null);
}

function req(url, extra = {}) {
  return {
    url,
    json: () => Promise.resolve(extra.body ?? {}),
    formData: () => Promise.resolve(extra.formData ?? new FormData()),
    signal: { addEventListener: vi.fn() },
  };
}

const FULL = [...ALL_PERMISSIONS];

/**
 * Matriz de autorização das rotas de API.
 *
 * `proxy.js` libera todo `/api`, então cada handler precisa se proteger
 * sozinho — esta é a rede de segurança contra regressões nessa barreira.
 * A autorização é por PERMISSÃO (registro em src/lib/permissions.js), não
 * mais por cargo.
 */
describe("Autorização das rotas de API", () => {
  beforeEach(() => {
    eventManager.removeAllListeners();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Rota, método e permissão exigida (null = qualquer sessão fresca basta)
  const MATRIX = [
    { path: "@/app/api/queue/events/route.js", method: "GET", permission: null },
    { path: "@/app/api/queue/recent/route.js", method: "GET", permission: null },
    { path: "@/app/api/queue/call/route.js", method: "POST", permission: QUEUE_CALL },
    { path: "@/app/api/queue/recall/route.js", method: "POST", permission: QUEUE_RECALL },
    { path: "@/app/api/queue/reset/route.js", method: "POST", permission: QUEUE_RESET },
    { path: "@/app/api/queue/sync/route.js", method: "POST", permission: QUEUE_SYNC },
    { path: "@/app/api/news/route.js", method: "GET", permission: null },
    { path: "@/app/api/news/route.js", method: "POST", permission: NEWS_CREATE },
    { path: "@/app/api/news/route.js", method: "DELETE", permission: NEWS_DELETE },
    { path: "@/app/api/users/route.js", method: "GET", permission: USERS_VIEW },
    { path: "@/app/api/users/route.js", method: "POST", permission: USERS_CREATE },
    { path: "@/app/api/users/route.js", method: "PATCH", permission: USERS_EDIT },
    { path: "@/app/api/users/route.js", method: "DELETE", permission: USERS_DELETE },
    { path: "@/app/api/roles/route.js", method: "GET", permission: USERS_VIEW },
    { path: "@/app/api/roles/route.js", method: "POST", permission: ROLES_MANAGE },
    { path: "@/app/api/roles/route.js", method: "PATCH", permission: ROLES_MANAGE },
    { path: "@/app/api/roles/route.js", method: "DELETE", permission: ROLES_MANAGE },
    { path: "@/app/api/stats/route.js", method: "GET", permission: null },
  ];

  const url = "http://localhost/api/queue/recent?sector=farmacia&limit=1";

  for (const { path, method, permission } of MATRIX) {
    const name = `${path.replace("@/app", "")} ${method}`;

    describe(name, () => {
      it("sem sessão devolve 401", async () => {
        asAnonymous();
        const mod = await importRoute(path);
        const res = await mod[method](req(url, { body: { sector: "farmacia" } }));

        expect(res.status).toBe(401);
      });

      if (permission) {
        it("sessão sem a permissão devolve 403", async () => {
          asSession();
          const mod = await importRoute(path);
          const res = await mod[method](req(url, { body: { sector: "farmacia" } }));

          expect(res.status).toBe(403);
        });
      }

      it("sessão com a permissão (e escopo) passa da autorização", async () => {
        asSession({ permissions: FULL });
        const mod = await importRoute(path);
        const res = await mod[method](req(url, { body: { sector: "farmacia" } }));

        expect(res.status).not.toBe(401);
        expect(res.status).not.toBe(403);
      });
    });
  }
});

describe("Frescor da sessão (auth_at / perms_at)", () => {
  beforeEach(() => {
    eventManager.removeAllListeners();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const url = "http://localhost/api/queue/recent?sector=farmacia&limit=1";

  it("permissões stale (>15min) devolve 401 refresh_required", async () => {
    const { GET } = await importRoute("@/app/api/queue/recent/route.js");
    auth.mockResolvedValue(
      session({
        permissions: FULL,
        permsAt: Date.now() - 16 * 60 * 1000,
      }),
    );

    const res = await GET(req(url));

    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("refresh_required");
  });

  it("sessão além do teto absoluto (12h) devolve 401 session_expired", async () => {
    const { GET } = await importRoute("@/app/api/queue/recent/route.js");
    auth.mockResolvedValue(
      session({
        permissions: FULL,
        authAt: Date.now() - 13 * 60 * 60 * 1000,
        // perms_at novo, mas auth_at vencido manda primeiro
        permsAt: Date.now(),
      }),
    );

    const res = await GET(req(url));

    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("session_expired");
  });

  it("token antigo sem claims de frescor é tratado como expirado", async () => {
    const { GET } = await importRoute("@/app/api/queue/recent/route.js");
    auth.mockResolvedValue({
      user: { id: "u1", name: "Legado", permissions: FULL },
    });

    const res = await GET(req(url));

    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("session_expired");
  });
});

describe("Escopo de setor", () => {
  beforeEach(() => {
    eventManager.removeAllListeners();
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await cleanupAllTestUsers();
  });

  // Atendente baseline do seed: telas próprias + chamar/repetir
  const ATTENDANT = [
    "tela.home",
    "tela.painel",
    "tela.historico",
    "tela.monitor",
    QUEUE_CALL,
    QUEUE_RECALL,
  ];

  it("atendente opera a fila do PRÓPRIO setor", async () => {
    const { POST } = await importRoute("@/app/api/queue/recall/route.js");
    auth.mockResolvedValue(
      session({ sector: "farmacia", permissions: ATTENDANT }),
    );

    const res = await POST(
      req("http://localhost/api/queue/recall", { body: { sector: "farmacia" } }),
    );

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("atendente NÃO opera a fila de OUTRO setor (403)", async () => {
    const { POST } = await importRoute("@/app/api/queue/recall/route.js");
    auth.mockResolvedValue(
      session({ sector: "farmacia", permissions: ATTENDANT }),
    );

    const res = await POST(
      req("http://localhost/api/queue/recall", { body: { sector: "recepcao" } }),
    );

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("sector_forbidden");
  });

  it("sem setor asignado e sem escopo, tudo é negado (403)", async () => {
    const { POST } = await importRoute("@/app/api/queue/call/route.js");
    auth.mockResolvedValue(session({ sector: null, permissions: ATTENDANT }));

    const res = await POST(
      req("http://localhost/api/queue/call", { body: { sector: "farmacia" } }),
    );

    expect(res.status).toBe(403);
  });

  it("permissão de escopo de escrita libera qualquer setor", async () => {
    const { POST } = await importRoute("@/app/api/queue/reset/route.js");
    auth.mockResolvedValue(
      session({
        sector: null,
        permissions: [...ATTENDANT, QUEUE_RESET, SECTORS_MANAGE_ALL],
      }),
    );

    const res = await POST(
      req("http://localhost/api/queue/reset", { body: { sector: "recepcao" } }),
    );

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("reset de TODOS os setores exige escopo de escrita em todos", async () => {
    const { POST } = await importRoute("@/app/api/queue/reset/route.js");
    auth.mockResolvedValue(
      session({ sector: "farmacia", permissions: [...ATTENDANT, QUEUE_RESET] }),
    );

    const res = await POST(
      req("http://localhost/api/queue/reset", { body: { sector: "all" } }),
    );

    expect(res.status).toBe(403);
  });

  it("leitura de fila de outro setor exige setores.todos.ver", async () => {
    const { GET } = await importRoute("@/app/api/queue/recent/route.js");
    auth.mockResolvedValue(
      session({ sector: "farmacia", permissions: ATTENDANT }),
    );

    const res = await GET(
      req("http://localhost/api/queue/recent?sector=recepcao&limit=1"),
    );

    expect(res.status).toBe(403);
  });

  it("estatísticas agregadas (sem setor) exigem setores.todos.ver", async () => {
    const { GET } = await importRoute("@/app/api/stats/route.js");

    auth.mockResolvedValue(
      session({ sector: "farmacia", permissions: ATTENDANT }),
    );
    const negado = await GET(req("http://localhost/api/stats?days=7"));
    expect(negado.status).toBe(403);

    auth.mockResolvedValue(
      session({ sector: null, permissions: [...ATTENDANT, SECTORS_VIEW_ALL] }),
    );
    const permitido = await GET(req("http://localhost/api/stats?days=7"));
    expect(permitido.status).not.toBe(401);
    expect(permitido.status).not.toBe(403);
  });

  it("usuário com escopo lê e opera qualquer setor", async () => {
    const { GET } = await importRoute("@/app/api/queue/recent/route.js");
    auth.mockResolvedValue(
      session({ sector: null, permissions: [...ATTENDANT, SECTORS_VIEW_ALL] }),
    );

    const res = await GET(
      req("http://localhost/api/queue/recent?sector=recepcao&limit=1"),
    );

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

describe("Gestão de cargos e permissões (RBAC)", () => {
  let createdRoleIds = [];
  let targetUserId = null;

  beforeEach(() => {
    eventManager.removeAllListeners();
    createdRoleIds = [];
    auth.mockResolvedValue(session({ permissions: FULL }));
  });

  afterEach(async () => {
    vi.clearAllMocks();
    const { prisma } = await import("@/lib/prisma-client");
    if (createdRoleIds.length) {
      await prisma.roles.deleteMany({
        where: { id: { in: createdRoleIds } },
      });
    }
    if (targetUserId) {
      await prisma.users.delete({ where: { id: targetUserId } }).catch(() => {});
      targetUserId = null;
    }
    await cleanupAllTestUsers();
  });

  it("cria cargo, lista e exclui", async () => {
    const { GET, POST, DELETE } = await importRoute("@/app/api/roles/route.js");
    const key = `cargo-teste-${Date.now()}`;

    const created = await POST(
      req("http://localhost/api/roles", {
        body: { key, name: "Cargo Teste", permissions: ["tela.painel"] },
      }),
    );
    expect(created.status).toBe(200);
    const { role } = await created.json();
    createdRoleIds.push(role.id);

    const list = await GET();
    expect(list.status).toBe(200);
    const body = await list.json();
    expect(body.roles.some((r) => r.key === key)).toBe(true);

    const removed = await DELETE(
      req(`http://localhost/api/roles?id=${role.id}`),
    );
    expect(removed.status).toBe(200);
  });

  it("cargo built-in não pode ser editado nem excluído (403)", async () => {
    const { GET, PATCH, DELETE } = await importRoute("@/app/api/roles/route.js");

    const list = await GET();
    const { roles } = await list.json();
    const builtIn = roles.find((r) => r.key === "admin");
    expect(builtIn?.built_in).toBe(true);

    const patched = await PATCH(
      req("http://localhost/api/roles", {
        body: { id: builtIn.id, permissions: ["tela.painel"] },
      }),
    );
    expect(patched.status).toBe(403);

    const removed = await DELETE(
      req(`http://localhost/api/roles?id=${builtIn.id}`),
    );
    expect(removed.status).toBe(403);
  });

  it("chave de permissão desconhecida é rejeitada (400)", async () => {
    const { POST } = await importRoute("@/app/api/roles/route.js");

    const res = await POST(
      req("http://localhost/api/roles", {
        body: { key: `x.${Date.now()}`, name: "X", permissions: ["permissao.fake"] },
      }),
    );

    expect(res.status).toBe(400);
  });

  it("PATCH /api/users aplica overrides de permissão (grant/deny)", async () => {
    const { PATCH } = await importRoute("@/app/api/users/route.js");
    const target = await seedTestUser({
      username: `test.rbac.${Date.now()}`,
      full_name: "Alvo RBAC",
      role: "attendant",
    });
    targetUserId = target.id;

    const res = await PATCH(
      req("http://localhost/api/users", {
        body: {
          id: target.id,
          full_name: "Alvo RBAC Editado",
          permissions: [
            { permission: "filas.resetar", granted: true },
            { permission: "filas.chamar", granted: false },
          ],
        },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.permissions).toEqual(
      expect.arrayContaining([
        { permission: "filas.resetar", granted: true },
        { permission: "filas.chamar", granted: false },
      ]),
    );
  });

  it("não é possível alterar o próprio cargo/situação (400)", async () => {
    const { PATCH } = await importRoute("@/app/api/users/route.js");
    const me = await seedTestUser({
      username: `test.self.${Date.now()}`,
      full_name: "Eu Mesmo",
      role: "admin",
    });
    targetUserId = me.id;

    // sessão == alvo: a proteção contra auto-lockout deve recusar
    auth.mockResolvedValue(
      session({ id: me.id, permissions: FULL }),
    );

    const res = await PATCH(
      req("http://localhost/api/users", {
        body: { id: me.id, active: false },
      }),
    );

    expect(res.status).toBe(400);
  });
});

describe("/api/queue/events — limite de conexões", () => {
  beforeEach(() => {
    eventManager.removeAllListeners();
  });

  afterEach(() => {
    eventManager.removeAllListeners();
    vi.clearAllMocks();
  });

  function streamReq(sector) {
    return {
      url: `http://localhost/api/queue/events?sector=${sector}`,
      signal: { addEventListener: vi.fn() },
    };
  }

  it(`devolve 429 acima de ${MAX_SSE_CONNECTIONS_PER_SECTOR} conexões`, async () => {
    const { GET } = await importRoute("@/app/api/queue/events/route.js");
    asSession({ permissions: FULL });

    // Sobe no limite.
    const unsubs = [];
    for (let i = 0; i < MAX_SSE_CONNECTIONS_PER_SECTOR; i++) {
      const res = await GET(streamReq("farmacia"));
      expect(res.status).toBe(200);
      // O stream fica aberto; força o cleanup do teste.
      unsubs.push(() => res.body?.cancel?.());
    }

    const rejected = await GET(streamReq("farmacia"));
    expect(rejected.status).toBe(429);

    await Promise.all(unsubs.map((fn) => fn().catch(() => {})));
  });

  it("o limite é por setor", async () => {
    const { GET } = await importRoute("@/app/api/queue/events/route.js");
    asSession({ permissions: FULL });

    const streams = [];
    for (let i = 0; i < MAX_SSE_CONNECTIONS_PER_SECTOR; i++) {
      const res = await GET(streamReq("farmacia"));
      streams.push(res);
    }

    // Outro setor ainda tem cota.
    const other = await GET(streamReq("recepcao"));
    expect(other.status).toBe(200);

    await Promise.all(
      streams.map((res) => res.body?.cancel?.().catch(() => {})),
    );
  });

  it("sessão anônima não abre stream", async () => {
    const { GET } = await importRoute("@/app/api/queue/events/route.js");
    asAnonymous();

    const res = await GET(streamReq("farmacia"));

    expect(res.status).toBe(401);
    expect(eventManager.getSubscriberCount("farmacia")).toBe(0);
  });

  it("recusa setor inválido antes de abrir stream", async () => {
    const { GET } = await importRoute("@/app/api/queue/events/route.js");
    asSession({ permissions: FULL });

    const res = await GET(streamReq("inexistente"));

    expect(res.status).toBe(400);
  });

  it("todos os setores do enum continuam acessíveis", () => {
    for (const sector of Object.keys(SECTORS)) {
      expect(SECTORS[sector]).toBeDefined();
    }
  });
});
