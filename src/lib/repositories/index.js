// Facade for data layer — selects backend based on DATA_LAYER env var
// Supported values: "supabase" (default), "postgres"

import { QueueRepository } from "./queue-repo.js";
import { ReadRepository } from "./read-repo.js";
import { RealtimeRepository } from "./realtime-repo.js";

const DATA_LAYER = process.env.DATA_LAYER || "supabase";

let auth, users, news;

if (DATA_LAYER === "postgres") {
  const mod = await import("./auth-repo.postgres.js");
  auth = new mod.AuthRepository();
  const usersMod = await import("./users-repo.postgres.js");
  users = new usersMod.UsersRepository();
  const newsMod = await import("./news-repo.postgres.js");
  news = new newsMod.NewsRepository();
} else {
  auth = new (await import("./auth-repo.js")).AuthRepository();
  users = new (await import("./users-repo.js")).UsersRepository();
  news = new (await import("./news-repo.js")).NewsRepository();
}

export const queue = new QueueRepository();
export const read = new ReadRepository();
export { auth, users, news };
export const realtime = new RealtimeRepository();

export function getDataLayer() {
  return { queue, read, auth, users, news, realtime };
}

export default { queue, read, auth, users, news, realtime };
