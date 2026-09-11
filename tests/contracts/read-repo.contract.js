import { describe, it, expect } from "vitest";

/**
 * ReadRepository contract — shared test suite.
 * Pass a factory that returns { repo, seedCalls }.
 * seedCalls is an async function that inserts test data and returns the inserted records.
 */
export function readRepoContract(createRepo) {
  describe("ReadRepository contract", () => {
    let repo;
    let seedCalls;

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
          expect(call).toHaveProperty("time");
          expect(typeof call.number).toBe("number");
        }
      });
    });
  });
}
