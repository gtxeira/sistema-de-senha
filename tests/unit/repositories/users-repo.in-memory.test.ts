import { usersRepoContract } from '../../contracts/users-repo.contract';
import { InMemoryUsersRepository } from '../../helpers/in-memory-repos/in-memory-users-repo';

usersRepoContract(() => {
  const repo = new InMemoryUsersRepository();

  return {
    repo,
    seedUser: (data) => repo.seedUser(data),
  };
});
