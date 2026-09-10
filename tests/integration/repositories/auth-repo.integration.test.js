import { describe, beforeEach, afterEach } from "vitest";
import { authRepoContract } from "../../contracts/auth-repo.contract.js";
import { isSupabaseReady, getAdminClient, seedTestUser, cleanupTestUsers } from "../setup.js";

const describeIfSupabase = isSupabaseReady ? describe : describe.skip;

describeIfSupabase("AuthRepository — Supabase integration", () => {
  let seededUsernames = [];

  beforeEach(async () => {
    seededUsernames = [];
  });

  afterEach(async () => {
    await cleanupTestUsers(seededUsernames);
  });

  authRepoContract(async () => {
    const { AuthRepository } = await import("@/lib/repositories/auth-repo.js");
    const repo = new AuthRepository();

    return {
      repo,
      seedUser: async (data) => {
        const result = await seedTestUser(data);
        seededUsernames.push(data.username);
        return result;
      },
    };
  });
});
