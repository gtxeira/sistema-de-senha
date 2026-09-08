// Facade for data layer - selects backend based on DATA_LAYER env var
// Supported values: "supabase" (default), "prisma" (future)

import { QueueRepository } from "./queue-repo.js";
import { ReadRepository } from "./read-repo.js";
import { AuthRepository } from "./auth-repo.js";
import { UsersRepository } from "./users-repo.js";
import { NewsRepository } from "./news-repo.js";
import { RealtimeRepository } from "./realtime-repo.js";

// For now, only Supabase adapter is implemented
// In the future, we can conditionally load prisma-adapter.js etc.

export const queue = new QueueRepository();
export const read = new ReadRepository();
export const auth = new AuthRepository();
export const users = new UsersRepository();
export const news = new NewsRepository();
export const realtime = new RealtimeRepository();

// For backward compatibility, also export a getDataLayer function
export function getDataLayer() {
  return {
    queue,
    read,
    auth,
    users,
    news,
    realtime,
  };
}

export default {
  queue,
  read,
  auth,
  users,
  news,
  realtime,
};