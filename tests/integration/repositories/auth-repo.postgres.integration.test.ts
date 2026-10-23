import { describe, beforeEach, afterEach } from "vitest";
import { authRepoContract } from "../../contracts/auth-repo.contract";
import { seedTestUser, cleanupTestUsers } from "../postgres-setup";

describe("AuthRepository — Postgres integration", () => {
  let seededUsernames: string[] = [];

  beforeEach(async () => {
    seededUsernames = [];
  });

  afterEach(async () => {
    await cleanupTestUsers(seededUsernames);
  });

  authRepoContract(async () => {
    const { PostgresAuthRepository } = await import(
      "@/server/repositories/auth-repo.postgres"
    );
    const repo = new PostgresAuthRepository();

    return {
      repo,
      seedUser: async (data) => {
        seededUsernames.push(data.username);
        return seedTestUser(data);
      },
    };
  });
});
