import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma-client";
import type { SequenceType } from "@/lib/constants";
import type { ReadRepository } from "@/lib/repositories/types";

// Check if Postgres is available
const isPostgresReady = Boolean(process.env.DATABASE_URL);
const describeIfPostgres = isPostgresReady ? describe : describe.skip;

/**
 * Clean up queue test data
 */
async function cleanupQueueTestData() {
  await prisma.queue_calls.deleteMany();
  await prisma.queue_sequences.deleteMany();
}

/**
 * Seed test queue calls
 */
async function seedTestCalls(
  sector: string,
  count: number,
  type: SequenceType = "normal",
): Promise<void> {
  const calls: Array<{
    sector_id: string;
    type: SequenceType;
    number_int: number;
    number_str: string;
  }> = [];
  for (let i = 0; i < count; i++) {
    calls.push({
      sector_id: sector,
      type,
      number_int: i + 1,
      number_str: `${type === "preferencial" ? "P" : "N"}${String(i + 1).padStart(3, "0")}`,
    });
  }
  await prisma.queue_calls.createMany({ data: calls });
}

describeIfPostgres("ReadRepository — Postgres integration", () => {
  let repo: ReadRepository;

  beforeEach(async () => {
    await cleanupQueueTestData();
    const { PostgresReadRepository } = await import(
      "@/lib/repositories/read-repo.postgres"
    );
    repo = new PostgresReadRepository();
  });

  afterEach(async () => {
    await cleanupQueueTestData();
  });

  describe("getStats()", () => {
    it("retorna estrutura vazia quando não há dados", async () => {
      const stats = await repo.getStats({ days: 7 });
      expect(stats).toHaveProperty("summary");
      expect(stats).toHaveProperty("bySector");
      expect(stats).toHaveProperty("byType");
      expect(stats).toHaveProperty("recent");
      expect(stats.summary.total).toBe(0);
    });

    it("retorna estatísticas corretas com dados", async () => {
      await seedTestCalls("farmacia", 5, "normal");
      await seedTestCalls("farmacia", 3, "preferencial");
      await seedTestCalls("recepcao", 2, "normal");

      const stats = await repo.getStats({ days: 30 });

      expect(stats.summary.total).toBe(10);
      expect(stats.summary.normal).toBe(7);
      expect(stats.summary.preferencial).toBe(3);
    });

    it("agrupa por setor corretamente", async () => {
      await seedTestCalls("farmacia", 5);
      await seedTestCalls("recepcao", 3);

      const stats = await repo.getStats({ days: 30 });

      expect(stats.bySector).toHaveLength(2);
      const farmacia = stats.bySector.find((s) => s.sector === "farmacia");
      const recepcao = stats.bySector.find((s) => s.sector === "recepcao");
      expect(farmacia?.total).toBe(5);
      expect(recepcao?.total).toBe(3);
    });

    it("filtra por setor", async () => {
      await seedTestCalls("farmacia", 5);
      await seedTestCalls("recepcao", 3);

      const stats = await repo.getStats({ days: 30, sector: "farmacia" });

      expect(stats.summary.total).toBe(5);
    });

    it("retorna chamadas recentes", async () => {
      await seedTestCalls("farmacia", 3);

      const stats = await repo.getStats({ days: 30 });

      expect(stats.recent.length).toBeGreaterThan(0);
      expect(stats.recent[0]).toHaveProperty("id");
      expect(stats.recent[0]).toHaveProperty("number");
      expect(stats.recent[0]).toHaveProperty("type");
      // O INSTANTE (ISO), não "HH:mm".
      expect(stats.recent[0]).toHaveProperty("createdAt");
    });

    it("conta 'hoje' pela meia-noite BRT, não pela do servidor", async () => {
      // 02:30 UTC = 23:30 de ONTEM em BRT (UTC−03:00).
      await prisma.queue_calls.create({
        data: {
          sector_id: "farmacia",
          type: "normal",
          number_int: 1,
          number_str: "N001",
          created_at: new Date("2026-10-21T02:30:00.000Z"),
        },
      });
      // 13:00 UTC = 10:00 de HOJE em BRT.
      await prisma.queue_calls.create({
        data: {
          sector_id: "farmacia",
          type: "normal",
          number_int: 2,
          number_str: "N002",
          created_at: new Date("2026-10-22T13:00:00.000Z"),
        },
      });

      const stats = await repo.getStats({
        days: 30,
        now: new Date("2026-10-22T16:00:00.000Z"),
      });

      expect(stats.summary.today).toBe(1);
      expect(stats.summary.total).toBe(2);
    });

    it("lidar com erros graciosamente", async () => {
      const stats = await repo.getStats({ days: 30 });
      expect(stats).toHaveProperty("summary");
    });
  });
});
