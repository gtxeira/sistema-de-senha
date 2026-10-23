import { describe, beforeEach, afterEach } from "vitest";
import { newsRepoContract } from "../../contracts/news-repo.contract";
import { seedTestNews, cleanupTestNews } from "../postgres-setup";

describe("NewsRepository — Postgres integration", () => {
  let seededIds: number[] = [];

  beforeEach(async () => {
    seededIds = [];
  });

  afterEach(async () => {
    await cleanupTestNews(seededIds);
  });

  newsRepoContract(async () => {
    const { PostgresNewsRepository } = await import(
      "@/server/repositories/news-repo.postgres"
    );
    const repo = new PostgresNewsRepository();

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
