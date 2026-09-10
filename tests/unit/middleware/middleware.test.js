import { describe, expect, it, vi } from "vitest";
import { middleware } from "@/middleware";

function makeRequest(pathname, cookieValue) {
  const url = `http://localhost${pathname}`;
  return {
    nextUrl: Object.assign(new URL(url), { pathname }),
    url,
    cookies: {
      get: (name) => (cookieValue !== undefined ? { value: cookieValue } : undefined),
    },
  };
}

function locationHeader(res) {
  return res.headers.get("location");
}

describe("middleware", () => {
  it("redireciona raiz para /login", () => {
    const res = middleware(makeRequest("/"));
    expect(res.status).toBe(307);
    expect(locationHeader(res)).toMatch(/\/login$/);
  });

  it("ignora rotas estáticas e _next", () => {
    const res = middleware(makeRequest("/_next/static/chunk.js"));
    expect(locationHeader(res)).toBeNull();

    const api = middleware(makeRequest("/api/anything"));
    expect(locationHeader(api)).toBeNull();
  });

  it("ignora qualquer pathname que contenha ponto (estáticos)", () => {
    for (const p of ["/logo.png", "/favicon.ico", "/manifest.json", "/home/arquivo.css"]) {
      const res = middleware(makeRequest(p));
      expect(locationHeader(res)).toBeNull();
    }
  });

  it("deixa rotas públicas passarem", () => {
    const res = middleware(makeRequest("/login"));
    expect(locationHeader(res)).toBeNull();
  });

  it("permite rota protegida com cookie de sessão", () => {
    const res = middleware(makeRequest("/home", "1"));
    expect(locationHeader(res)).toBeNull();
  });

  it("redireciona rota protegida sem cookie para /login", () => {
    const res = middleware(makeRequest("/home"));
    expect(res.status).toBe(307);
    expect(locationHeader(res)).toMatch(/\/login$/);
  });

  it("redireciona rotas desconhecidas para /login", () => {
    const res = middleware(makeRequest("/qualquer-outra", "1"));
    expect(locationHeader(res)).toMatch(/\/login$/);
  });

  it("protege /admin e /monitor", () => {
    for (const p of ["/admin", "/monitor/farmacia"]) {
      const res = middleware(makeRequest(p));
      expect(locationHeader(res)).toMatch(/\/login$/);
    }
  });
});