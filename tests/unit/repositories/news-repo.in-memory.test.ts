import { newsRepoContract } from '../../contracts/news-repo.contract';
import { InMemoryNewsRepository } from '../../helpers/in-memory-repos/in-memory-news-repo';

newsRepoContract(() => {
  const repo = new InMemoryNewsRepository();

  return {
    repo,
    seedNews: (data) => repo.seedNews(data),
  };
});
