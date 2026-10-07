import { describe, it, expect } from "vitest";
import { readJson } from "@/lib/json";
import type { AuthUsersBody } from "@/types/api";

async function importRoute() {
  return import("@/app/api/auth/route");
}

describe("/api/auth — integration", () => {
  describe("GET (deprecated)", () => {
    it("retorna array vazio", async () => {
      const { GET } = await importRoute();
      const res = GET();
      const body = await readJson<AuthUsersBody>(res);

      expect(res.status).toBe(200);
      expect(body.users).toEqual([]);
    });
  });

  describe("ausência de caminho de credenciais paralelo", () => {
    it("não exporta POST", async () => {
      const mod = await importRoute();

      // O antigo POST /api/auth verificava usuario+senha sem rate limiting e
      // sem emitir cookie de sessao — um segundo caminho de login. A
      // autenticacao real acontece no NextAuth (/api/auth/[...nextauth]).
      // `mod.POST` não compila — a chave nem existe no tipo do módulo.
      expect("POST" in mod).toBe(false);
    });
  });
});
