import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { seedTestUser, cleanupAllTestUsers } from "../../postgres-setup.js";

let createdUsernames = [];

async function importRoute() {
  return import("@/app/api/users/route.js");
}

async function importUsersRepo() {
  const mod = await import("@/lib/repositories");
  return mod.users;
}

describe("/api/users — integration", () => {
  beforeEach(() => {
    createdUsernames = [];
  });

  afterEach(async () => {
    await cleanupAllTestUsers();
    createdUsernames = [];
  });

  describe("GET", () => {
    it("retorna lista de usuários", async () => {
      const repo = await importUsersRepo();
      const user = await seedTestUser({
        username: `test.get.user.${Date.now()}`,
        full_name: "GET Test User",
      });
      createdUsernames.push(user.username);

      const { GET } = await importRoute();
      const res = await GET();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(Array.isArray(body.users)).toBe(true);
      const found = body.users.find((u) => u.id === user.id);
      expect(found).toBeDefined();
      expect(found.full_name).toBe("GET Test User");
    });

    it("retorna vazio quando não há usuários de teste", async () => {
      const { GET } = await importRoute();
      const res = await GET();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(Array.isArray(body.users)).toBe(true);
    });
  });

  describe("POST", () => {
    it("cria usuário e persiste no banco", async () => {
      const username = `test.post.user.${Date.now()}`;
      const { POST } = await importRoute();
      const req = {
        json: () =>
          Promise.resolve({
            username,
            password: "123456",
            full_name: "Post Test User",
            role: "attendant",
            sector_id: "farmacia",
          }),
      };
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.user.username).toBe(username);
      expect(body.user.full_name).toBe("Post Test User");
      expect(body.user.role).toBe("attendant");
      expect(body.user.sector_id).toBe("farmacia");

      createdUsernames.push(username);

      const repo = await importUsersRepo();
      const list = await repo.list();
      const found = list.find((u) => u.username === username);
      expect(found).toBeDefined();
      expect(found.full_name).toBe("Post Test User");
    });

    it("retorna 400 com username inválido", async () => {
      const { POST } = await importRoute();
      const req = {
        json: () =>
          Promise.resolve({
            username: "!invalido!",
            password: "123456",
            full_name: "Test",
          }),
      };
      const res = await POST(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("retorna 400 sem senha", async () => {
      const { POST } = await importRoute();
      const req = {
        json: () =>
          Promise.resolve({
            username: `test.nopw.user.${Date.now()}`,
            password: "",
            full_name: "Test",
          }),
      };
      const res = await POST(req);

      expect(res.status).toBe(400);
    });

    it("retorna 400 sem full_name", async () => {
      const { POST } = await importRoute();
      const req = {
        json: () =>
          Promise.resolve({
            username: `test.noname.user.${Date.now()}`,
            password: "123456",
            full_name: "",
          }),
      };
      const res = await POST(req);

      expect(res.status).toBe(400);
    });

    it("retorna 409 com username duplicado", async () => {
      const username = `test.dup.user.${Date.now()}`;
      await seedTestUser({ username, full_name: "Original" });
      createdUsernames.push(username);

      const { POST } = await importRoute();
      const req = {
        json: () =>
          Promise.resolve({
            username,
            password: "123456",
            full_name: "Duplicado",
          }),
      };
      const res = await POST(req);

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toMatch(/já existe/i);
    });

    it("aplica defaults (role=attendant, sector_id=null)", async () => {
      const username = `test.defaults.user.${Date.now()}`;
      const { POST } = await importRoute();
      const req = {
        json: () =>
          Promise.resolve({
            username,
            password: "123456",
            full_name: "Defaults User",
          }),
      };
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.user.role).toBe("attendant");
      expect(body.user.sector_id).toBeNull();

      createdUsernames.push(username);
    });

    it("faz trim no username", async () => {
      const base = `test.trim.user.${Date.now()}`;
      const username = `  ${base}  `;
      const { POST } = await importRoute();
      const req = {
        json: () =>
          Promise.resolve({
            username,
            password: "123456",
            full_name: "Trim User",
          }),
      };
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.user.username).toBe(base);

      createdUsernames.push(base);
    });
  });

  describe("DELETE", () => {
    it("retorna 400 sem id", async () => {
      const { DELETE } = await importRoute();
      const req = { url: "http://localhost/api/users" };
      const res = await DELETE(req);

      expect(res.status).toBe(400);
    });

    it("retorna 404 quando usuário não existe", async () => {
      const { DELETE } = await importRoute();
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const req = { url: `http://localhost/api/users?id=${fakeId}` };
      const res = await DELETE(req);

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toMatch(/não encontrado/i);
    });

    it("remove usuário e não aparece mais na listagem", async () => {
      const username = `test.del.user.${Date.now()}`;
      const user = await seedTestUser({ username, full_name: "To Delete" });
      createdUsernames.push(username);

      const { DELETE } = await importRoute();
      const req = { url: `http://localhost/api/users?id=${user.id}` };
      const res = await DELETE(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const repo = await importUsersRepo();
      const list = await repo.list();
      const found = list.find((u) => u.id === user.id);
      expect(found).toBeUndefined();
    });
  });

  describe("fluxo completo", () => {
    it("cria, lista e deleta usuário", async () => {
      const username = `test.flow.user.${Date.now()}`;

      // 1. Criar
      const { POST } = await importRoute();
      const postRes = await POST({
        json: () =>
          Promise.resolve({
            username,
            password: "123456",
            full_name: "Flow User",
          }),
      });
      const postData = await postRes.json();
      expect(postRes.status).toBe(200);
      const userId = postData.user.id;

      // 2. Listar e verificar que aparece
      const { GET } = await importRoute();
      const getRes = await GET();
      const getData = await getRes.json();
      const found = getData.users.find((u) => u.id === userId);
      expect(found).toBeDefined();
      expect(found.full_name).toBe("Flow User");

      // 3. Deletar
      const { DELETE } = await importRoute();
      const delRes = await DELETE({ url: `http://localhost/api/users?id=${userId}` });
      expect(delRes.status).toBe(200);

      // 4. Verificar que não aparece mais
      const getRes2 = await GET();
      const getData2 = await getRes2.json();
      const notFound = getData2.users.find((u) => u.id === userId);
      expect(notFound).toBeUndefined();
    });
  });
});
