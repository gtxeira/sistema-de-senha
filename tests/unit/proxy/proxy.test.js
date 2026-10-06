import { describe, expect, it, vi } from "vitest";
import {
  ALL_PERMISSIONS,
  SECTORS_VIEW_ALL,
} from "@/lib/permissions.js";
import { REFRESH_COOKIE_NAME } from "@/lib/constants.js";

// Mock auth() pass-through: o valor do cookie de sessão É o JSON do usuário,
// então cada teste monta a sessão que quiser (permissões, setor, frescor).
vi.mock("@/auth", () => ({
  auth: (fn) => (req) => {
    const sessionCookie = req.cookies?.get?.("authjs.session-token")?.value;
    req.auth = sessionCookie ? { user: JSON.parse(sessionCookie) } : null;
    return fn(req);
  },
}));

// Import the default export (auth-wrapped proxy)
const { default: proxy } = await import("@/proxy");

function freshUser(overrides = {}) {
  const now = Date.now();
  return {
    id: "u1",
    name: "Teste",
    sector: "farmacia",
    permissions: [...ALL_PERMISSIONS],
    authAt: now,
    permsAt: now,
    ...overrides,
  };
}

function makeRequest(pathname, user, refreshToken) {
  const url = `http://localhost${pathname}`;
  const cookies = {};
  if (user !== undefined && user !== null) {
    cookies["authjs.session-token"] = { value: JSON.stringify(user) };
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

function locationHeader(res) {
  return res.headers.get("location");
}

function refreshUrlFor(pathname) {
  return `/api/auth/refresh?callbackUrl=${encodeURIComponent(pathname)}`;
}

describe("proxy", () => {
  it("redireciona raiz para /home quando há sessão válida", () => {
    const res = proxy(makeRequest("/", freshUser()));
    expect(res.status).toBe(307);
    expect(locationHeader(res)).toMatch(/\/home$/);
  });

  it("redireciona raiz para /login sem sessão e sem refresh", () => {
    const res = proxy(makeRequest("/"));
    expect(res.status).toBe(307);
    expect(locationHeader(res)).toMatch(/\/login$/);
  });

  it("redireciona raiz para o refresh quando há refresh token", () => {
    const res = proxy(makeRequest("/", null, "refresh-opaco"));
    expect(locationHeader(res)).toContain("/api/auth/refresh");
    expect(locationHeader(res)).toContain(encodeURIComponent("/home"));
  });

  it("ignora rotas estáticas e _next", () => {
    const res = proxy(makeRequest("/_next/static/chunk.js"));
    expect(locationHeader(res)).toBeNull();

    const api = proxy(makeRequest("/api/anything"));
    expect(locationHeader(api)).toBeNull();
  });

  it("ignora qualquer pathname que contenha ponto (estáticos)", () => {
    for (const p of ["/logo.png", "/favicon.ico", "/manifest.json", "/home/arquivo.css"]) {
      const res = proxy(makeRequest(p));
      expect(locationHeader(res)).toBeNull();
    }
  });

  it("deixa rotas públicas passarem", () => {
    const res = proxy(makeRequest("/login"));
    expect(locationHeader(res)).toBeNull();
  });

  it("autenticado indo para /login é levado para /home", () => {
    const res = proxy(makeRequest("/login", freshUser()));
    expect(locationHeader(res)).toMatch(/\/home$/);
  });

  it("permite rota protegida com sessão autenticada", () => {
    const res = proxy(makeRequest("/home", freshUser()));
    expect(locationHeader(res)).toBeNull();
  });

  it("redireciona rota protegida sem sessão para /login", () => {
    const res = proxy(makeRequest("/home"));
    expect(res.status).toBe(307);
    expect(locationHeader(res)).toMatch(/\/login$/);
  });

  it("sem sessão mas com refresh token, tenta acordar a sessão", () => {
    const res = proxy(makeRequest("/painel", null, "refresh-opaco"));
    expect(locationHeader(res)).toContain("/api/auth/refresh");
    expect(locationHeader(res)).toContain(encodeURIComponent("/painel"));
  });

  it("redireciona rotas desconhecidas para /login", () => {
    const res = proxy(makeRequest("/qualquer-outra", freshUser()));
    expect(locationHeader(res)).toMatch(/\/login$/);
  });

  it("protege /admin e /monitor", () => {
    for (const p of ["/admin", "/monitor/farmacia"]) {
      const res = proxy(makeRequest(p));
      expect(locationHeader(res)).toMatch(/\/login$/);
    }
  });
});

describe("proxy — frescor da sessão (auth_at / perms_at)", () => {
  it("permissões stale dispara refresh", () => {
    const res = proxy(
      makeRequest(
        "/home",
        freshUser({ permsAt: Date.now() - 16 * 60 * 1000 }),
        "refresh-opaco",
      ),
    );
    expect(locationHeader(res)).toContain("/api/auth/refresh");
    expect(locationHeader(res)).toContain(encodeURIComponent("/home"));
  });

  it("sessão além de 12h sem refresh cookie vai para /login", () => {
    const res = proxy(
      makeRequest("/home", freshUser({ authAt: Date.now() - 13 * 60 * 60 * 1000 })),
    );
    expect(locationHeader(res)).toMatch(/\/login$/);
  });

  it("token legado sem claims de frescor é tratado como expirado", () => {
    const res = proxy(makeRequest("/home", { id: "u1", name: "Legado" }));
    expect(locationHeader(res)).toMatch(/\/login$/);
  });
});

describe("proxy — permissões de tela", () => {
  it("sem tela.admin, /admin cai para /home", () => {
    const user = freshUser({
      permissions: ALL_PERMISSIONS.filter((p) => p !== "tela.admin"),
    });
    const res = proxy(makeRequest("/admin", user));
    expect(locationHeader(res)).toMatch(/\/home$/);
  });

  it("sem nenhuma tela, /admin cai para /login (sem loop)", () => {
    const user = freshUser({ permissions: [] });
    const res = proxy(makeRequest("/admin", user));
    expect(locationHeader(res)).toMatch(/\/login$/);
  });

  it("sem tela.painel, /painel é negado", () => {
    const user = freshUser({
      permissions: ALL_PERMISSIONS.filter((p) => p !== "tela.painel"),
    });
    const res = proxy(makeRequest("/painel", user));
    expect(locationHeader(res)).toMatch(/\/home$/);
  });

  it("sessão stale no /login tenta o refresh antes de renderizar", () => {
    const res = proxy(
      makeRequest(
        "/login",
        freshUser({ permsAt: Date.now() - 16 * 60 * 1000 }),
        "refresh-opaco",
      ),
    );
    expect(locationHeader(res)).toContain("/api/auth/refresh");
  });
});

describe("proxy — escopo de setor em /monitor", () => {
  it("atendente vê o monitor do PRÓPRIO setor", () => {
    const user = freshUser({ sector: "farmacia", permissions: ["tela.monitor"] });
    const res = proxy(makeRequest("/monitor/farmacia", user));
    expect(locationHeader(res)).toBeNull();
  });

  it("atendente NÃO vê o monitor de OUTRO setor", () => {
    const user = freshUser({
      sector: "farmacia",
      permissions: ["tela.home", "tela.monitor"],
    });
    const res = proxy(makeRequest("/monitor/recepcao", user));
    expect(locationHeader(res)).toMatch(/\/home$/);
  });

  it("setores.todos.ver libera qualquer monitor", () => {
    const user = freshUser({
      sector: "farmacia",
      permissions: ["tela.monitor", SECTORS_VIEW_ALL],
    });
    const res = proxy(makeRequest("/monitor/recepcao", user));
    expect(locationHeader(res)).toBeNull();
  });
});
