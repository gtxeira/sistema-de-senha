import { describe, beforeEach, afterEach } from "vitest";
import { usersRepoContract } from "../../contracts/users-repo.contract.js";
import { seedTestUser, cleanupTestUsers } from "../postgres-setup.js";

describe("UsersRepository — Postgres integration", () => {
  let seededUsernames = [];

  beforeEach(async () => {
    seededUsernames = [];
  });

  afterEach(async () => {
    await cleanupTestUsers(seededUsernames);
  });

  usersRepoContract(async () => {
    const { UsersRepository } = await import(
      "@/lib/repositories/users-repo.postgres.js"
    );
    const repo = new UsersRepository();

    return {
      repo,
      seedUser: async (data) => {
        const result = await seedTestUser(data);
        seededUsernames.push(data.username || result.username);
        return result;
      },
    };
  });
});
