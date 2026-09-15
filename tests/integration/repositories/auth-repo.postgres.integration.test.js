import { describe, beforeEach, afterEach } from "vitest";
import { authRepoContract } from "../../contracts/auth-repo.contract.js";
import { seedTestUser, cleanupTestUsers } from "../postgres-setup.js";

describe("AuthRepository — Postgres integration", () => {
  let seededUsernames = [];

  beforeEach(async () => {
    seededUsernames = [];
  });

  afterEach(async () => {
    await cleanupTestUsers(seededUsernames);
  });

  authRepoContract(async () => {
    const { AuthRepository } = await import(
      "@/lib/repositories/auth-repo.postgres.js"
    );
    const repo = new AuthRepository();

    return {
      repo,
      seedUser: async (data) => {
        seededUsernames.push(data.username);
        return seedTestUser(data);
      },
    };
  });
});
