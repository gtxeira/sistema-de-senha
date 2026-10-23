import { beforeEach, describe, expect, it } from "vitest";
import type { AuthRepository } from "@/server/repositories/types";

/** Subconjunto do seed que o contrato usa — o Postgres aceita mais campos. */
export interface AuthSeedUserInput {
  readonly username: string;
  readonly password: string;
  readonly full_name?: string;
  readonly role?: string;
  readonly sector_id?: string | null;
}

/** Fábrica devolvida por quem invoca o contrato (in-memory ou Postgres). */
export interface AuthRepoContext {
  readonly repo: AuthRepository;
  readonly seedUser: (
    data: AuthSeedUserInput,
  ) =>
    | { username: string; password: string }
    | Promise<{ username: string; password: string }>;
}

/**
 * AuthRepository contract — shared test suite.
 * Pass a factory that returns { repo, seedUser }.
 * seedUser inserts a test user and returns { username, password }.
 */
export function authRepoContract(
  createRepo: () => AuthRepoContext | Promise<AuthRepoContext>,
): void {
  describe("AuthRepository contract", () => {
    // Atribuídas em `beforeEach` — o analisador não enxerga o fluxo entre
    // callbacks, então não há erro de "usado antes de atribuir".
    let repo: AuthRepository;
    let seedUser: AuthRepoContext["seedUser"];

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

    describe("superfície da interface", () => {
      it("não expõe verificação de credenciais", () => {
        // A verificação de senha vive em src/auth.ts (NextAuth). Expor um
        // `login()` aqui criaria um segundo caminho de credenciais sem rate
        // limiting. `repo.login` não compilaria — checamos a presença da chave.
        expect("login" in repo).toBe(false);
      });
    });
  });
}
