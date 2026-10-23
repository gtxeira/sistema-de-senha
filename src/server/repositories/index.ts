import 'server-only';

import type {
  AuthRepository,
  NewsRepository,
  QueueRepository,
  ReadRepository,
  RolesRepository,
  UsersRepository,
} from './types';

/**
 * Repositórios de dados — implementações Postgres.
 *
 * `getDataLayer()` é o ponto único de acesso, e cada propriedade é tipada
 * pela interface correspondente de `./types`. É isso que permite trocar a
 * implementação (as em-memória usadas nos testes de contrato rodam sem que o
 * restante da aplicação perceba a troca).
 */
import { PostgresAuthRepository } from './auth-repo.postgres';
import { PostgresNewsRepository } from './news-repo.postgres';
import { PostgresQueueRepository } from './queue-repo.postgres';
import { PostgresReadRepository } from './read-repo.postgres';
import { PostgresRolesRepository } from './roles-repo.postgres';
import { PostgresUsersRepository } from './users-repo.postgres';

export interface DataLayer {
  readonly queue: QueueRepository;
  readonly read: ReadRepository;
  readonly auth: AuthRepository;
  readonly users: UsersRepository;
  readonly roles: RolesRepository;
  readonly news: NewsRepository;
}

export const queue: QueueRepository = new PostgresQueueRepository();
export const read: ReadRepository = new PostgresReadRepository();
export const auth: AuthRepository = new PostgresAuthRepository();
export const users: UsersRepository = new PostgresUsersRepository();
export const roles: RolesRepository = new PostgresRolesRepository();
export const news: NewsRepository = new PostgresNewsRepository();

export function getDataLayer(): DataLayer {
  return { queue, read, auth, users, roles, news };
}

const repositories: DataLayer = getDataLayer();
export default repositories;
