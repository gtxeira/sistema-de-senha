import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/server/db/prisma-client";
import type { SequenceType } from "@/shared/constants";
import type { ReadRepository } from "@/server/repositories/types";
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
      "@/server/repositories/read-repo.postgres"
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
      expect(stats).toHaveProperty("calls");
      expect(stats.pagination).toEqual({
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 1,
      });
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

    it("pagina dentro do setor", async () => {
      await seedTestCalls("farmacia", 5);
      await seedTestCalls("recepcao", 3);

      const stats = await repo.getStats({
        days: 30,
        sector: "farmacia",
        pageSize: 2,
      });

      // O total é o do setor, não o da tabela inteira.
      expect(stats.pagination.total).toBe(5);
      expect(stats.calls).toHaveLength(2);
      expect(stats.calls.every((c) => c.sector_id === "farmacia")).toBe(true);
    });

    it("filtra por setor", async () => {
      await seedTestCalls("farmacia", 5);
      await seedTestCalls("recepcao", 3);

      const stats = await repo.getStats({ days: 30, sector: "farmacia" });

      expect(stats.summary.total).toBe(5);
    });

    it("retorna a página do histórico", async () => {
      await seedTestCalls("farmacia", 3);

      const stats = await repo.getStats({ days: 30 });

      expect(stats.calls.length).toBeGreaterThan(0);
      expect(stats.calls[0]).toHaveProperty("id");
      expect(stats.calls[0]).toHaveProperty("number");
      expect(stats.calls[0]).toHaveProperty("type");
      // O INSTANTE (ISO), não "HH:mm".
      expect(stats.calls[0]).toHaveProperty("createdAt");
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

    it("agrega e pagina no SQL — não traz a janela inteira para a memória", async () => {
      await seedTestCalls("farmacia", 5);

      const countSpy = vi.spyOn(prisma.queue_calls, "count");
      const groupBySpy = vi.spyOn(prisma.queue_calls, "groupBy");
      const findManySpy = vi.spyOn(prisma.queue_calls, "findMany");

      try {
        const stats = await repo.getStats({ days: 30, pageSize: 2, page: 2 });

        // total + hoje
        expect(countSpy).toHaveBeenCalledTimes(2);
        // só por tipo (o resumo precisa de normal/preferencial)
        expect(groupBySpy).toHaveBeenCalledTimes(1);

        // O único `findMany` é o da PÁGINA exibida — `skip`/`take`/ordem.
        // A regressão que este teste barra é o `findMany` sem `take`, que
        // puxava até 90 dias de chamadas para paginar no cliente.
        expect(findManySpy).toHaveBeenCalledTimes(1);
        const args = findManySpy.mock.calls[0]?.[0] as
          | { take?: number; skip?: number; orderBy?: unknown }
          | undefined;
        expect(args?.take).toBe(2);
        expect(args?.skip).toBe(2);
        expect(args?.orderBy).toEqual([
          { created_at: "desc" },
          { id: "desc" },
        ]);

        // A contagem enxerga as 5; só a página veio para a memória.
        expect(stats.summary.total).toBe(5);
        expect(stats.pagination).toEqual({
          page: 2,
          pageSize: 2,
          total: 5,
          totalPages: 3,
        });
        expect(stats.calls).toHaveLength(2);
      } finally {
        countSpy.mockRestore();
        groupBySpy.mockRestore();
        findManySpy.mockRestore();
      }
    });

    it("tem os índices que sustentam a janela e a paginação", async () => {
      const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname FROM pg_indexes WHERE tablename = 'queue_calls'
      `;
      const names = indexes.map((row) => row.indexname);

      expect(names).toContain("queue_calls_created_at_id_idx");
      expect(names).toContain("queue_calls_sector_id_created_at_idx");
    });

    it("lidar com erros graciosamente", async () => {
      const stats = await repo.getStats({ days: 30 });
      expect(stats).toHaveProperty("summary");
    });
  });
});
