import { afterEach, beforeEach, describe } from 'vitest';

import { usersRepoContract } from '../../contracts/users-repo.contract';
import { cleanupTestUsers, seedTestUser } from '../postgres-setup';

describe('UsersRepository — Postgres integration', () => {
  let seededUsernames: string[] = [];

  beforeEach(async () => {
    seededUsernames = [];
  });

  afterEach(async () => {
    await cleanupTestUsers(seededUsernames);
  });

  usersRepoContract(async () => {
    const { PostgresUsersRepository } =
      await import('@/server/repositories/users-repo.postgres');
    const repo = new PostgresUsersRepository();

    return {
      repo,
      seedUser: async (data) => {
        const result = await seedTestUser(data);
        seededUsernames.push(data.username || result.username);
        return result;
      },
    };
  });
});
