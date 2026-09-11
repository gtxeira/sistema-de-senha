import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { seedTestUser, cleanupAllTestUsers } from "../../postgres-setup.js";

let createdUsernames = [];

async function importRoute() {
  return import("@/app/api/auth/route.js");
}

describe("/api/auth — integration", () => {
  beforeEach(() => {
    createdUsernames = [];
  });

  afterEach(async () => {
    await cleanupAllTestUsers();
    createdUsernames = [];
  });

  describe("GET (deprecated)", () => {
    it("retorna array vazio", async () => {
      const { GET } = await importRoute();
      const res = await GET();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.users).toEqual([]);
    });
  });

  describe("POST", () => {
    it("retorna 400 sem login", async () => {
      const { POST } = await importRoute();
      const req = {
        json: () => Promise.resolve({ password: "123456" }),
      };
      const res = await POST(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/obrigatórios/i);
    });

    it("retorna 400 sem password", async () => {
      const { POST } = await importRoute();
      const req = {
        json: () => Promise.resolve({ login: "test.user" }),
      };
      const res = await POST(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/obrigatórios/i);
    });

    it("retorna 400 com username inválido (formato)", async () => {
      const { POST } = await importRoute();
      const req = {
        json: () => Promise.resolve({ login: "!invalido!", password: "123456" }),
      };
      const res = await POST(req);

      expect(res.status).toBe(400);
    });

    it("retorna 401 com credenciais inválidas (usuário não existe)", async () => {
      const { POST } = await importRoute();
      const req = {
        json: () =>
          Promise.resolve({
            login: "naoexiste.naoexiste",
            password: "123456",
          }),
      };
      const res = await POST(req);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toMatch(/inválidos/i);
    });

    it("retorna 401 com senha incorreta", async () => {
      const username = `test.wrongpw.user.${Date.now()}`;
      await seedTestUser({ username, password: "correta123" });
      createdUsernames.push(username);

      const { POST } = await importRoute();
      const req = {
        json: () =>
          Promise.resolve({ login: username, password: "errada" }),
      };
      const res = await POST(req);

      expect(res.status).toBe(401);
    });

    it("retorna 403 com perfil inativo", async () => {
      const username = `test.inactive.user.${Date.now()}`;
      await seedTestUser({ username, password: "123456" });
      createdUsernames.push(username);

      const { prisma } = await import("../../postgres-setup.js");
      await prisma.users.update({
        where: { username },
        data: { active: false },
      });

      const { POST } = await importRoute();
      const req = {
        json: () =>
          Promise.resolve({ login: username, password: "123456" }),
      };
      const res = await POST(req);

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toMatch(/acesso ativo/i);
    });

    it("retorna dados do usuário com login válido", async () => {
      const username = `test.login.user.${Date.now()}`;
      await seedTestUser({
        username,
        password: "minha123",
        full_name: "Login User",
        role: "admin",
        sector_id: "farmacia",
      });
      createdUsernames.push(username);

      const { POST } = await importRoute();
      const req = {
        json: () =>
          Promise.resolve({ login: username, password: "minha123" }),
      };
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.name).toBe("Login User");
      expect(body.role).toBe("admin");
      expect(body.sector).toBe("farmacia");
      expect(body.initials).toBe("LU");
      expect(body.id).toBeDefined();
    });
  });

  describe("fluxo completo", () => {
    it("criar usuário via repo → login via API → verificar retorno", async () => {
      const username = `test.authflow.user.${Date.now()}`;

      // 1. Criar usuário via repo
      await seedTestUser({
        username,
        password: "flow123",
        full_name: "Auth Flow User",
      });
      createdUsernames.push(username);

      // 2. Login via API
      const { POST } = await importRoute();
      const req = {
        json: () => Promise.resolve({ login: username, password: "flow123" }),
      };
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.name).toBe("Auth Flow User");
      expect(body.id).toBeDefined();
      expect(body.role).toBeDefined();
    });
  });
});
