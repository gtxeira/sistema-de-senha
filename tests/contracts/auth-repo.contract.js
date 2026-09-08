import { describe, it, expect } from "vitest";

/**
 * AuthRepository contract — shared test suite.
 * Pass a factory that returns { repo, seedUser }.
 * seedUser inserts a test user and returns { username, password }.
 */
export function authRepoContract(createRepo) {
  describe("AuthRepository contract", () => {
    let repo;
    let seedUser;

    beforeEach(async () => {
      const ctx = await createRepo();
      repo = ctx.repo;
      seedUser = ctx.seedUser;
    });

    describe("resolveLoginEmail()", () => {
      it("retorna email para username válido", async () => {
        const { username } = await seedUser({
          username: "teste.resolver",
          password: "123456",
          full_name: "Teste Resolver",
        });
        const email = await repo.resolveLoginEmail(username);
        expect(typeof email).toBe("string");
        expect(email.length).toBeGreaterThan(0);
      });

      it("lança erro para username inexistente", async () => {
        await expect(
          repo.resolveLoginEmail("naoexiste.naoexiste"),
        ).rejects.toMatchObject({ status: 404 });
      });
    });

    describe("login()", () => {
      it("retorna objeto com campos obrigatórios para credenciais válidas", async () => {
        const { username, password } = await seedUser({
          username: "teste.login",
          password: "minha123",
          full_name: "Teste Login",
          role: "admin",
          sector_id: "farmacia",
        });

        const result = await repo.login(username, password);

        expect(result).toHaveProperty("id");
        expect(result).toHaveProperty("name");
        expect(result).toHaveProperty("initials");
        expect(result).toHaveProperty("role");
        expect(result).toHaveProperty("sector");
        expect(result.name).toBe("Teste Login");
        expect(result.role).toBe("admin");
        expect(result.sector).toBe("farmacia");
      });

      it("initials gera no máximo 2 caracteres do nome", async () => {
        const { username, password } = await seedUser({
          username: "teste.initials",
          password: "minha123",
          full_name: "João da Silva Santos",
        });

        const result = await repo.login(username, password);
        expect(result.initials.length).toBeLessThanOrEqual(2);
        // "João da Silva Santos" → first letters: J, d, S, S → slice(0,2) = "JD"
        expect(result.initials).toBe("JD");
      });

      it("lança erro para credenciais inválidas", async () => {
        await seedUser({
          username: "teste.senhaerrada",
          password: "correta123",
          full_name: "Teste Senha Errada",
        });

        await expect(
          repo.login("teste.senhaerrada", "senherrada"),
        ).rejects.toMatchObject({ status: 401 });
      });

      it("lança erro para username inexistente", async () => {
        await expect(
          repo.login("naoexiste.naoexiste", "qualquer123"),
        ).rejects.toMatchObject({ status: 401 });
      });
    });
  });
}
