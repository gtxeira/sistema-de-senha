import { describe, beforeEach, afterEach } from "vitest";
import { newsRepoContract } from "../contracts/news-repo.contract.js";
import { isSupabaseReady, getAdminClient, seedTestNews, cleanupTestNews } from "./setup.js";

const describeIfSupabase = isSupabaseReady ? describe : describe.skip;

describeIfSupabase("NewsRepository — Supabase integration", () => {
  let seededNewsIds = [];

  beforeEach(async () => {
    seededNewsIds = [];
  });

  afterEach(async () => {
    await cleanupTestNews(seededNewsIds);
  });

  newsRepoContract(async () => {
    const { NewsRepository } = await import("@/lib/repositories/news-repo.js");
    const repo = new NewsRepository();

    return {
      repo,
      seedNews: async (data) => {
        const result = await seedTestNews(data);
        seededNewsIds.push(result.id);
        return result;
      },
    };
  });
});
