import { describe, beforeEach, afterEach } from "vitest";
import { newsRepoContract } from "../../contracts/news-repo.contract.js";
import { seedTestNews, cleanupTestNews } from "../postgres-setup.js";

describe("NewsRepository — Postgres integration", () => {
  let seededIds = [];

  beforeEach(async () => {
    seededIds = [];
  });

  afterEach(async () => {
    await cleanupTestNews(seededIds);
  });

  newsRepoContract(async () => {
    const { NewsRepository } = await import(
      "@/lib/repositories/news-repo.postgres.js"
    );
    const repo = new NewsRepository();

    return {
      repo,
      seedNews: async (data) => {
        const result = await seedTestNews(data);
        seededIds.push(result.id);
        return result;
      },
    };
  });
});
