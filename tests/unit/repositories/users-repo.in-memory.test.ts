import { InMemoryUsersRepository } from '../../helpers/in-memory-repos/in-memory-users-repo';
import { usersRepoContract } from '../../contracts/users-repo.contract';

usersRepoContract(() => {
  const repo = new InMemoryUsersRepository();

  return {
    repo,
    seedUser: (data) => repo.seedUser(data),
  };
});
