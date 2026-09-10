import { describe, beforeEach, afterEach } from "vitest";
import { readRepoContract } from "../../contracts/read-repo.contract.js";
import { isSupabaseReady, getAdminClient, cleanupQueueTestData } from "../setup.js";

const describeIfSupabase = isSupabaseReady ? describe : describe.skip;

describeIfSupabase("ReadRepository — Supabase integration", () => {
  let testCallIds = [];

  beforeEach(async () => {
    await cleanupQueueTestData();
    testCallIds = [];
  });

  afterEach(async () => {
    await cleanupQueueTestData();
  });

  readRepoContract(async () => {
    const { ReadRepository } = await import("@/lib/repositories/read-repo.js");
    const repo = new ReadRepository();
    const db = getAdminClient();

    return {
      repo,
      seedCalls: async (calls) => {
        for (const c of calls) {
          const { data, error } = await db
            .from("queue_calls")
            .insert({
              sector_id: c.sector,
              type: c.type === "preferencial" ? "preferencial" : "normal",
              number_int: c.number,
              number_str: `${c.type === "preferencial" ? "P" : "N"}${String(c.number).padStart(3, "0")}`,
              created_at: c.created_at || new Date().toISOString(),
            })
            .select("id")
            .single();

          if (!error && data) {
            testCallIds.push(data.id);
          }
        }
      },
    };
  });
});
