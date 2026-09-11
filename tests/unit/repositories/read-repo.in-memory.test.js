import { InMemoryReadRepository } from "../../helpers/in-memory-repos/in-memory-read-repo.js";
import { readRepoContract } from "../../contracts/read-repo.contract.js";

readRepoContract(() => {
  // Shared calls array — seedCalls appends to it, repo reads from it
  const calls = [];
  const repo = new InMemoryReadRepository(calls);

  return {
    repo,
    seedCalls: async (newCalls) => {
      for (const c of newCalls) {
        calls.push({
          ...c,
          created_at: c.created_at || new Date(),
        });
      }
      // Re-create repo to pick up the new data
      return newCalls;
    },
  };
});
