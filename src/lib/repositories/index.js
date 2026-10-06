import { AuthRepository } from "./auth-repo.postgres.js";
import { UsersRepository } from "./users-repo.postgres.js";
import { RolesRepository } from "./roles-repo.postgres.js";
import { NewsRepository } from "./news-repo.postgres.js";
import { QueueRepository } from "./queue-repo.postgres.js";
import { ReadRepository } from "./read-repo.postgres.js";

const auth = new AuthRepository();
const users = new UsersRepository();
const roles = new RolesRepository();
const news = new NewsRepository();
const queue = new QueueRepository();
const read = new ReadRepository();

export { auth, users, roles, news, queue, read };

export function getDataLayer() {
  return { queue, read, auth, users, roles, news };
}

const repositories = { queue, read, auth, users, roles, news };
export default repositories;
