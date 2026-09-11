// Facade for data layer — selects backend based on DATA_LAYER env var
// Supported values: "supabase" (default), "postgres"

const DATA_LAYER = process.env.DATA_LAYER || "supabase";

let auth, users, news, queue, read;

if (DATA_LAYER === "postgres") {
  const mod = await import("./auth-repo.postgres.js");
  auth = new mod.AuthRepository();
  const usersMod = await import("./users-repo.postgres.js");
  users = new usersMod.UsersRepository();
  const newsMod = await import("./news-repo.postgres.js");
  news = new newsMod.NewsRepository();
  const queueMod = await import("./queue-repo.postgres.js");
  queue = new queueMod.QueueRepository();
  const readMod = await import("./read-repo.postgres.js");
  read = new readMod.ReadRepository();
} else {
  const supabaseQueue = await import("./queue-repo.js");
  queue = new supabaseQueue.QueueRepository();
  const supabaseRead = await import("./read-repo.js");
  read = new supabaseRead.ReadRepository();
  auth = new (await import("./auth-repo.js")).AuthRepository();
  users = new (await import("./users-repo.js")).UsersRepository();
  news = new (await import("./news-repo.js")).NewsRepository();
}

// Realtime uses SSE (Server-Sent Events) — no repository needed.
// The event-manager.js singleton handles pub/sub server-side.
export { auth, users, news, queue, read };

export function getDataLayer() {
  return { queue, read, auth, users, news };
}

export default { queue, read, auth, users, news };
