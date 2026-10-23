import { authRepoContract } from '../../contracts/auth-repo.contract';
import { InMemoryAuthRepository } from '../../helpers/in-memory-repos/in-memory-auth-repo';

authRepoContract(() => {
  const repo = new InMemoryAuthRepository();

  // Seed a default user for most tests
  repo.seedUser({
    full_name: 'Default User',
    password: 'default123',
    role: 'attendant',
    sector_id: 'farmacia',
    username: 'default.user',
  });

  return {
    repo,
    seedUser: (data) => repo.seedUser(data),
  };
});
