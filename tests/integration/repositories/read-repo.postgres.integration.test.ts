import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma-client";
import type { SequenceType } from "@/lib/constants";
import type { ReadRepository } from "@/lib/repositories/types";
import {
  readRepoContract,
  type SeedCall,
} from "../../contracts/read-repo.contract";

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

/** `SeedCall.type` é `string`; a coluna só aceita o enum `queue_type`. */
function seedType(type: string): SequenceType {
  return type === "preferencial" || type === "preferential"
    ? "preferencial"
    : "normal";
}

/** Mesma grafia de `InMemoryReadRepository`: "P001"/"N001". */
function seedNumberStr(type: string, number: number): string {
  return `${seedType(type) === "preferencial" ? "P" : "N"}${String(number).padStart(3, "0")}`;
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

  // O MESMO contrato que roda contra a implementação em memória. É o que
  // garante que trocar a varredura em JS por `count`/`groupBy` no SQL não
  // mudou semântica nenhuma (filtro de setor, agrupamentos, "hoje" em BRT).
  readRepoContract(() => ({
    repo,
    seedCalls: async (calls: readonly SeedCall[]) => {
      if (calls.length === 0) return;
      await prisma.queue_calls.createMany({
        data: calls.map((call) => ({
          sector_id: call.sector,
          type: seedType(call.type),
          number_int: call.number,
          number_str: seedNumberStr(call.type, call.number),
          ...(call.created_at ? { created_at: new Date(call.created_at) } : {}),
        })),
      });
    },
  }));

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

    it("agrega no SQL — não traz a janela inteira para a memória", async () => {
      await seedTestCalls("farmacia", 5);

      const countSpy = vi.spyOn(prisma.queue_calls, "count");
      const groupBySpy = vi.spyOn(prisma.queue_calls, "groupBy");
      const findManySpy = vi.spyOn(prisma.queue_calls, "findMany");

      try {
        const stats = await repo.getStats({ days: 30, limit: 2 });

        // total + hoje
        expect(countSpy).toHaveBeenCalledTimes(2);
        // por setor + por tipo
        expect(groupBySpy).toHaveBeenCalledTimes(2);

        // O único `findMany` é o do que a tela EXIBE — limitado e ordenado.
        // A regressão que este teste barra é o `findMany` sem `take`, que
        // puxava até 90 dias de chamadas só para contar em JS.
        expect(findManySpy).toHaveBeenCalledTimes(1);
        const args = findManySpy.mock.calls[0]?.[0] as
          | { take?: number; orderBy?: unknown }
          | undefined;
        expect(args?.take).toBe(2);
        expect(args?.orderBy).toEqual({ created_at: "desc" });

        // A contagem enxerga as 5; só 2 vieram para a memória.
        expect(stats.summary.total).toBe(5);
        expect(stats.recent).toHaveLength(2);
      } finally {
        countSpy.mockRestore();
        groupBySpy.mockRestore();
        findManySpy.mockRestore();
      }
    });

    it("lidar com erros graciosamente", async () => {
      const stats = await repo.getStats({ days: 30 });
      expect(stats).toHaveProperty("summary");
    });
  });
});
