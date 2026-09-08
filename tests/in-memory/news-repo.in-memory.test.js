import { InMemoryNewsRepository } from "./in-memory-news-repo.js";
import { newsRepoContract } from "../contracts/news-repo.contract.js";

newsRepoContract(() => {
  const repo = new InMemoryNewsRepository();

  return {
    repo,
    seedNews: (data) => repo.seedNews(data),
  };
});
