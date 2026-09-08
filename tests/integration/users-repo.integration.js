import { describe, beforeEach, afterEach } from "vitest";
import { usersRepoContract } from "../contracts/users-repo.contract.js";
import { isSupabaseReady, getAdminClient, seedTestUser, cleanupTestUsers } from "./setup.js";

const describeIfSupabase = isSupabaseReady ? describe : describe.skip;

describeIfSupabase("UsersRepository — Supabase integration", () => {
  let seededUsernames = [];

  beforeEach(async () => {
    seededUsernames = [];
  });

  afterEach(async () => {
    await cleanupTestUsers(seededUsernames);
  });

  usersRepoContract(async () => {
    const { UsersRepository } = await import("@/lib/repositories/users-repo.js");
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
