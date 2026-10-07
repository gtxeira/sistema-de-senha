import { InMemoryNewsRepository } from "../../helpers/in-memory-repos/in-memory-news-repo";
import { newsRepoContract } from "../../contracts/news-repo.contract";

newsRepoContract(() => {
  const repo = new InMemoryNewsRepository();

  return {
    repo,
    seedNews: (data) => repo.seedNews(data),
  };
});
