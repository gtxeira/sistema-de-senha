import { describe, beforeEach, afterEach } from "vitest";
import { queueRepoContract } from "../../contracts/queue-repo.contract.js";
import { isSupabaseReady, getAdminClient, cleanupQueueTestData } from "../setup.js";

const describeIfSupabase = isSupabaseReady ? describe : describe.skip;

describeIfSupabase("QueueRepository — Supabase integration", () => {
  beforeEach(async () => {
    await cleanupQueueTestData();
  });

  afterEach(async () => {
    await cleanupQueueTestData();
  });

  queueRepoContract(async () => {
    // Dynamic import to ensure env vars are loaded
    const { QueueRepository } = await import("@/lib/repositories/queue-repo.js");
    return new QueueRepository();
  });
});
