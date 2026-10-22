import { beforeEach, describe, expect, it } from "vitest";
import type { ReadRepository } from "@/lib/repositories/types";

/**
 * Linha de entrada para o seed de chamadas — mais solta que o registro gravado:
 * `created_at` é opcional (o seed preenche com "agora") e `type` é `string`
 * porque o contrato valida agregação por valor, não por tipo literal.
 */
export interface SeedCall {
  readonly sector: string;
  readonly type: string;
  readonly number: number;
  readonly created_at?: Date | string;
}

/** Fábrica devolvida por quem invoca o contrato. */
export interface ReadRepoContext {
  readonly repo: ReadRepository;
  /** Retorna o que foi inserido — o contrato ignora o valor. */
  readonly seedCalls: (calls: readonly SeedCall[]) => unknown;
}

/**
 * ReadRepository contract — shared test suite.
 * Pass a factory that returns { repo, seedCalls }.
 * seedCalls is an async function that inserts test data and returns the inserted records.
 */
export function readRepoContract(
  createRepo: () => ReadRepoContext | Promise<ReadRepoContext>,
): void {
  describe("ReadRepository contract", () => {
    let repo: ReadRepository;
    let seedCalls: ReadRepoContext["seedCalls"];

    beforeEach(async () => {
      const ctx = await createRepo();
      repo = ctx.repo;
      seedCalls = ctx.seedCalls;
    });

    describe("getStats()", () => {
      it("retorna estrutura válida com campos obrigatórios", async () => {
        const stats = await repo.getStats();
        expect(stats).toHaveProperty("days");
        expect(stats).toHaveProperty("summary");
        expect(stats).toHaveProperty("bySector");
        expect(stats).toHaveProperty("byType");
        expect(stats).toHaveProperty("recent");
        expect(stats).toHaveProperty("recentBySector");
      });

      it("summary.total é soma de preferencial + normal", async () => {
        await seedCalls([
          { sector: "farmacia", type: "normal", number: 1 },
          { sector: "farmacia", type: "preferencial", number: 1 },
          { sector: "recepcao", type: "normal", number: 1 },
        ]);
        const stats = await repo.getStats();
        expect(stats.summary.total).toBe(
          stats.summary.preferencial + stats.summary.normal,
        );
      });

      it("filtra por sector quando informado", async () => {
        await seedCalls([
          { sector: "farmacia", type: "normal", number: 1 },
          { sector: "recepcao", type: "normal", number: 1 },
          { sector: "recepcao", type: "normal", number: 2 },
        ]);
        const stats = await repo.getStats({ sector: "farmacia" });
        expect(stats.summary.total).toBe(1);
      });

      it("bySector agrupa corretamente", async () => {
        await seedCalls([
          { sector: "farmacia", type: "normal", number: 1 },
          { sector: "farmacia", type: "normal", number: 2 },
          { sector: "recepcao", type: "normal", number: 1 },
        ]);
        const stats = await repo.getStats();
        const farmacia = stats.bySector.find((s) => s.sector === "farmacia");
        const recepcao = stats.bySector.find((s) => s.sector === "recepcao");
        expect(farmacia?.total).toBe(2);
        expect(recepcao?.total).toBe(1);
      });

      it("byType agrupa corretamente", async () => {
        await seedCalls([
          { sector: "farmacia", type: "normal", number: 1 },
          { sector: "farmacia", type: "preferencial", number: 1 },
          { sector: "farmacia", type: "preferencial", number: 2 },
        ]);
        const stats = await repo.getStats();
        const normal = stats.byType.find((t) => t.type === "normal");
        const pref = stats.byType.find((t) => t.type === "preferencial");
        expect(normal?.total).toBe(1);
        expect(pref?.total).toBe(2);
      });

      it("recent retorna no máximo limit registros", async () => {
        const calls = Array.from({ length: 5 }, (_, i) => ({
          sector: "farmacia",
          type: "normal",
          number: i + 1,
        }));
        await seedCalls(calls);
        const stats = await repo.getStats({ limit: 3 });
        expect(stats.recent.length).toBeLessThanOrEqual(3);
      });

      it("recent registros têm formato correto", async () => {
        await seedCalls([{ sector: "farmacia", type: "normal", number: 1 }]);
        const stats = await repo.getStats();
        if (stats.recent.length > 0) {
          const call = stats.recent[0];
          expect(call).toHaveProperty("id");
          expect(call).toHaveProperty("number");
          expect(call).toHaveProperty("type");
          // O INSTANTE (ISO), não "HH:mm": um horário sem data não diz de
          // que dia a chamada foi.
          expect(call).toHaveProperty("createdAt");
          expect(typeof call.number).toBe("number");
          expect(Number.isNaN(Date.parse(call.createdAt))).toBe(false);
        }
      });

      it("summary.today conta o dia BRT, não o dia UTC", async () => {
        // 02:30 UTC = 23:30 do dia ANTERIOR em BRT (UTC−03:00).
        const yesterdayBrt = "2026-10-21T02:30:00.000Z";
        // 13:00 UTC = 10:00 de HOJE em BRT.
        const todayBrt = "2026-10-22T13:00:00.000Z";

        await seedCalls([
          { sector: "farmacia", type: "normal", number: 1, created_at: yesterdayBrt },
          { sector: "farmacia", type: "normal", number: 2, created_at: todayBrt },
        ]);

        const stats = await repo.getStats({
          days: 30,
          now: new Date("2026-10-22T16:00:00.000Z"),
        });

        // Só a chamada das 13:00 UTC pertence a "hoje" (BRT).
        expect(stats.summary.today).toBe(1);
        expect(stats.summary.total).toBe(2);
      });

      it("a janela de 'Hoje' é o dia-calendário BRT", async () => {
        // 02:30 UTC = 23:30 de ONTEM em BRT → fora da janela de "Hoje".
        const yesterdayBrt = "2026-10-21T02:30:00.000Z";
        const todayBrt = "2026-10-22T13:00:00.000Z";

        await seedCalls([
          { sector: "farmacia", type: "normal", number: 1, created_at: yesterdayBrt },
          { sector: "farmacia", type: "normal", number: 2, created_at: todayBrt },
        ]);

        const stats = await repo.getStats({
          days: 1,
          now: new Date("2026-10-22T16:00:00.000Z"),
        });

        expect(stats.summary.total).toBe(1);
        expect(stats.recent).toHaveLength(1);
        expect(stats.recent[0].number).toBe(2);
      });
    });
  });
}
