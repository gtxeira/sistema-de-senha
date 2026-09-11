import { describe, it, expect } from "vitest";

/**
 * UsersRepository contract — shared test suite.
 * Pass a factory that returns { repo, seedUser }.
 * seedUser inserts a test user and returns { id, username }.
 */
export function usersRepoContract(createRepo) {
  describe("UsersRepository contract", () => {
    let repo;
    let seedUser;

    beforeEach(async () => {
      const ctx = await createRepo();
      repo = ctx.repo;
      seedUser = ctx.seedUser;
    });

    describe("list()", () => {
      it("retorna array de usuários", async () => {
        await seedUser({ username: "teste.list1", full_name: "Teste List 1" });
        const users = await repo.list();
        expect(Array.isArray(users)).toBe(true);
      });

      it("cada usuário tem campos obrigatórios", async () => {
        await seedUser({ username: "teste.fields", full_name: "Teste Fields" });
        const users = await repo.list();
        const user = users.find((u) => u.username === "teste.fields");
        expect(user).toBeDefined();
        expect(user).toHaveProperty("id");
        expect(user).toHaveProperty("full_name");
        expect(user).toHaveProperty("role");
      });
    });

    describe("create()", () => {
      it("insere e retorna usuário com success: true", async () => {
        const result = await repo.create({
          username: `user.create.${Date.now()}`,
          password: "test123456",
          full_name: "Teste Create",
          role: "attendant",
          sector_id: "farmacia",
        });

        expect(result.success).toBe(true);
        expect(result.user).toHaveProperty("id");
        expect(result.user.username).toMatch(/^user\.create\./);
        expect(result.user.full_name).toBe("Teste Create");
      });

      it("valida formato de username (nome.sobrenome)", async () => {
        // "user!" has special char — should be rejected
        try {
          await repo.create({
            username: "user!",
            password: "test123456",
            full_name: "Teste Inválido",
          });
          expect.fail("Should have thrown");
        } catch (err) {
          expect(err.status).toBe(400);
        }

        // "user name" has space — should be rejected
        try {
          await repo.create({
            username: "user name",
            password: "test123456",
            full_name: "Teste Espaço",
          });
          expect.fail("Should have thrown");
        } catch (err) {
          expect(err.status).toBe(400);
        }
      });

      it("rejeita username duplicado", async () => {
        const username = `dup.user.${Date.now()}`;
        await repo.create({
          username,
          password: "test123456",
          full_name: "Primeiro",
        });

        await expect(
          repo.create({
            username,
            password: "test123456",
            full_name: "Segundo",
          }),
        ).rejects.toMatchObject({ status: 409 });
      });

      it("define role padrão como attendant", async () => {
        const result = await repo.create({
          username: `role.default.${Date.now()}`,
          password: "test123456",
          full_name: "Teste Role Default",
        });
        expect(result.user.role).toBe("attendant");
      });
    });

    describe("remove()", () => {
      it("deleta usuário existente sem erro", async () => {
        const { id } = await seedUser({
          username: `remove.me.${Date.now()}`,
          full_name: "Remove Me",
        });
        await expect(repo.remove(id)).resolves.toBeUndefined();
      });

      it("lança erro para ID inexistente", async () => {
        await expect(
          repo.remove("00000000-0000-0000-0000-000000000000"),
        ).rejects.toMatchObject({ status: 404 });
      });
    });
  });
}
