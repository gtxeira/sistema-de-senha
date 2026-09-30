import { describe, expect, it, vi } from "vitest";

// Mock auth() to be a pass-through wrapper that attaches req.auth
vi.mock("@/auth", () => ({
  auth: (fn) => (req) => {
    const sessionCookie =
      req.cookies?.get?.("next-auth.session-token")?.value ||
      req.cookies?.get?.("__Secure-next-auth.session-token")?.value;
    req.auth = sessionCookie ? { user: { id: "test" } } : null;
    return fn(req);
  },
}));

// Import the default export (auth-wrapped proxy)
const { default: proxy } = await import("@/proxy");

function makeRequest(pathname, cookieValue) {
  const url = `http://localhost${pathname}`;
  const cookies = {};
  if (cookieValue !== undefined) {
    cookies["next-auth.session-token"] = { value: cookieValue };
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

describe("proxy", () => {
  it("redireciona raiz para /login", () => {
    const res = proxy(makeRequest("/"));
    expect(res.status).toBe(307);
    expect(locationHeader(res)).toMatch(/\/login$/);
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

  it("permite rota protegida com sessão autenticada", () => {
    const res = proxy(makeRequest("/home", "valid-token"));
    expect(locationHeader(res)).toBeNull();
  });

  it("redireciona rota protegida sem sessão para /login", () => {
    const res = proxy(makeRequest("/home"));
    expect(res.status).toBe(307);
    expect(locationHeader(res)).toMatch(/\/login$/);
  });

  it("redireciona rotas desconhecidas para /login", () => {
    const res = proxy(makeRequest("/qualquer-outra", "valid-token"));
    expect(locationHeader(res)).toMatch(/\/login$/);
  });

  it("protege /admin e /monitor", () => {
    for (const p of ["/admin", "/monitor/farmacia"]) {
      const res = proxy(makeRequest(p));
      expect(locationHeader(res)).toMatch(/\/login$/);
    }
  });
});
