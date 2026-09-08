import { InMemoryUsersRepository } from "./in-memory-users-repo.js";
import { usersRepoContract } from "../contracts/users-repo.contract.js";

usersRepoContract(() => {
  const repo = new InMemoryUsersRepository();

  return {
    repo,
    seedUser: (data) => repo.seedUser(data),
  };
});
