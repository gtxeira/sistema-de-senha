import { beforeEach, describe, expect, it } from "vitest";
import type { UsersRepository } from "@/lib/repositories/types";
import { errorStatus } from "@/lib/repositories/utils";

/** Subconjunto do seed que os testes de contrato usam. */
export interface UsersSeedUserInput {
  readonly username: string;
  readonly full_name?: string;
  readonly role?: string;
  readonly sector_id?: string | null;
  readonly active?: boolean;
  readonly password?: string;
}

/** Fábrica devolvida por quem invoca o contrato (in-memory ou Postgres). */
export interface UsersRepoContext {
  readonly repo: UsersRepository;
  readonly seedUser: (
    data: UsersSeedUserInput,
  ) => { id: string; username: string } | Promise<{ id: string; username: string }>;
}

/**
 * UsersRepository contract — shared test suite.
 * Pass a factory that returns { repo, seedUser }.
 * seedUser inserts a test user and returns { id, username }.
 */
export function usersRepoContract(
  createRepo: () => UsersRepoContext | Promise<UsersRepoContext>,
): void {
  describe("UsersRepository contract", () => {
    let repo: UsersRepository;
    let seedUser: UsersRepoContext["seedUser"];

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
          expect(errorStatus(err)).toBe(400);
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
          expect(errorStatus(err)).toBe(400);
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

    describe("update()", () => {
      it("atualiza dados básicos", async () => {
        const { id } = await seedUser({
          username: `update.me.${Date.now()}`,
          full_name: "Antes",
        });
        const user = await repo.update(id, {
          full_name: "Depois",
          sector_id: "recepcao",
        });
        expect(user.full_name).toBe("Depois");
        expect(user.sector_id).toBe("recepcao");
      });

      it("troca o cargo pela chave", async () => {
        const { id } = await seedUser({
          username: `update.role.${Date.now()}`,
          full_name: "Cargo Antes",
        });
        const user = await repo.update(id, { role: "admin" });
        expect(user.role).toBe("admin");
      });

      it("senha em branco é ignorada (não altera a senha atual)", async () => {
        const { id } = await seedUser({
          username: `update.pw.${Date.now()}`,
          full_name: "Senha",
        });
        const user = await repo.update(id, {
          password: "",
          full_name: "Nome Atualizado",
        });
        expect(user.full_name).toBe("Nome Atualizado");
      });

      it("404 para id inexistente", async () => {
        await expect(
          repo.update("00000000-0000-0000-0000-000000000000", {
            full_name: "Nada",
          }),
        ).rejects.toMatchObject({ status: 404 });
      });
    });

    describe("setPermissions()", () => {
      it("substitui os overrides do usuário", async () => {
        const { id } = await seedUser({
          username: `perms.set.${Date.now()}`,
          full_name: "Perms",
        });

        await repo.setPermissions(id, [
          { permission: "filas.resetar", granted: true },
        ]);
        // substituição completa: uma segunda chamada zera a anterior
        await repo.setPermissions(id, [
          { permission: "usuarios.ver", granted: false },
        ]);

        const user = (await repo.list()).find((u) => u.id === id);
        expect(user?.permissions).toEqual([
          { permission: "usuarios.ver", granted: false },
        ]);
      });

      it("rejeita chave de permissão desconhecida (400)", async () => {
        const { id } = await seedUser({
          username: `perms.bad.${Date.now()}`,
          full_name: "Bad",
        });
        await expect(
          repo.setPermissions(id, [{ permission: "permissao.fantasma", granted: true }]),
        ).rejects.toMatchObject({ status: 400 });
      });

      it("lista vazia limpa os overrides", async () => {
        const { id } = await seedUser({
          username: `perms.clear.${Date.now()}`,
          full_name: "Clear",
        });
        await repo.setPermissions(id, [
          { permission: "filas.resetar", granted: true },
        ]);
        await repo.setPermissions(id, []);

        const user = (await repo.list()).find((u) => u.id === id);
        expect(user?.permissions).toEqual([]);
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
