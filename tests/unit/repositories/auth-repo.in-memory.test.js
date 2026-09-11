import { InMemoryAuthRepository } from "../../helpers/in-memory-repos/in-memory-auth-repo.js";
import { authRepoContract } from "../../contracts/auth-repo.contract.js";

authRepoContract(() => {
  const repo = new InMemoryAuthRepository();

  // Seed a default user for most tests
  repo.seedUser({
    username: "default.user",
    password: "default123",
    full_name: "Default User",
    role: "attendant",
    sector_id: "farmacia",
  });

  return {
    repo,
    seedUser: (data) => repo.seedUser(data),
  };
});
