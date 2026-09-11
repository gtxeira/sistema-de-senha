import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanupQueueTestData } from "../../postgres-setup.js";
import { prisma } from "@/lib/prisma-client.js";

async function importRoute() {
  return import("@/app/api/stats/route.js");
}

async function importQueueRepo() {
  const mod = await import("@/lib/repositories");
  return mod.queue;
}

describe("/api/stats — integration", () => {
  beforeEach(async () => {
    await cleanupQueueTestData();
  });

  afterEach(async () => {
    await cleanupQueueTestData();
  });

  describe("GET", () => {
    it("retorna estrutura vazia quando não há dados", async () => {
      const { GET } = await importRoute();
      const req = { url: "http://localhost/api/stats" };
      const res = await GET(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.summary).toBeDefined();
      expect(body.summary.total).toBe(0);
      expect(body.bySector).toEqual([]);
      expect(body.recent).toEqual([]);
    });

    it("retorna estatísticas com chamadas reais", async () => {
      const repo = await importQueueRepo();
      await repo.saveCall({
        sector: "farmacia",
        number: 1,
        numberStr: "N001",
        sequenceType: "normal",
        callType: "normal",
        attendantId: null,
      });
      await repo.saveCall({
        sector: "farmacia",
        number: 2,
        numberStr: "N002",
        sequenceType: "normal",
        callType: "normal",
        attendantId: null,
      });
      await repo.saveCall({
        sector: "recepcao",
        number: 1,
        numberStr: "N001",
        sequenceType: "normal",
        callType: "normal",
        attendantId: null,
      });

      const { GET } = await importRoute();
      const req = { url: "http://localhost/api/stats" };
      const res = await GET(req);
      const body = await res.json();

      expect(body.summary.total).toBe(3);
      expect(body.summary.normal).toBe(3);
      expect(body.summary.preferencial).toBe(0);
    });

    it("agrupa por setor corretamente", async () => {
      const repo = await importQueueRepo();
      await repo.saveCall({
        sector: "farmacia",
        number: 1,
        numberStr: "N001",
        sequenceType: "normal",
        callType: "normal",
        attendantId: null,
      });
      await repo.saveCall({
        sector: "recepcao",
        number: 1,
        numberStr: "N001",
        sequenceType: "normal",
        callType: "normal",
        attendantId: null,
      });
      await repo.saveCall({
        sector: "recepcao",
        number: 2,
        numberStr: "N002",
        sequenceType: "normal",
        callType: "normal",
        attendantId: null,
      });

      const { GET } = await importRoute();
      const req = { url: "http://localhost/api/stats" };
      const res = await GET(req);
      const body = await res.json();

      expect(body.bySector).toHaveLength(2);
      const recepcao = body.bySector.find((s) => s.sector === "recepcao");
      const farmacia = body.bySector.find((s) => s.sector === "farmacia");
      expect(recepcao.total).toBe(2);
      expect(farmacia.total).toBe(1);
    });

    it("filtra por setor", async () => {
      const repo = await importQueueRepo();
      await repo.saveCall({
        sector: "farmacia",
        number: 1,
        numberStr: "N001",
        sequenceType: "normal",
        callType: "normal",
        attendantId: null,
      });
      await repo.saveCall({
        sector: "recepcao",
        number: 1,
        numberStr: "N001",
        sequenceType: "normal",
        callType: "normal",
        attendantId: null,
      });

      const { GET } = await importRoute();
      const req = { url: "http://localhost/api/stats?sector=farmacia" };
      const res = await GET(req);
      const body = await res.json();

      expect(body.summary.total).toBe(1);
      expect(body.bySector).toHaveLength(1);
      expect(body.bySector[0].sector).toBe("farmacia");
    });

    it("limita days entre 1 e 90", async () => {
      const { GET } = await importRoute();

      const resLow = await GET({ url: "http://localhost/api/stats?days=0" });
      const bodyLow = await resLow.json();
      expect(bodyLow.days).toBeGreaterThanOrEqual(1);

      const resHigh = await GET({ url: "http://localhost/api/stats?days=999" });
      const bodyHigh = await resHigh.json();
      expect(bodyHigh.days).toBeLessThanOrEqual(90);

      const resDefault = await GET({ url: "http://localhost/api/stats" });
      const bodyDefault = await resDefault.json();
      expect(bodyDefault.days).toBeGreaterThanOrEqual(29);
      expect(bodyDefault.days).toBeLessThanOrEqual(31);
    });

    it("conta chamadas de hoje (today)", async () => {
      const repo = await importQueueRepo();
      await repo.saveCall({
        sector: "farmacia",
        number: 1,
        numberStr: "N001",
        sequenceType: "normal",
        callType: "normal",
        attendantId: null,
      });

      const { GET } = await importRoute();
      const req = { url: "http://localhost/api/stats" };
      const res = await GET(req);
      const body = await res.json();

      expect(body.summary.total).toBe(1);
    });

    it("retorna chamadas recentes", async () => {
      const repo = await importQueueRepo();
      await repo.saveCall({
        sector: "farmacia",
        number: 1,
        numberStr: "N001",
        sequenceType: "normal",
        callType: "normal",
        attendantId: null,
      });

      const { GET } = await importRoute();
      const req = { url: "http://localhost/api/stats" };
      const res = await GET(req);
      const body = await res.json();

      expect(body.recent.length).toBeGreaterThan(0);
      expect(body.recent[0]).toHaveProperty("id");
      expect(body.recent[0]).toHaveProperty("number");
      expect(body.recent[0]).toHaveProperty("type");
      expect(body.recent[0]).toHaveProperty("time");
    });

    it("agrupa chamadas recentes por setor", async () => {
      const repo = await importQueueRepo();
      await repo.saveCall({
        sector: "farmacia",
        number: 1,
        numberStr: "N001",
        sequenceType: "normal",
        callType: "normal",
        attendantId: null,
      });
      await repo.saveCall({
        sector: "recepcao",
        number: 1,
        numberStr: "N001",
        sequenceType: "normal",
        callType: "normal",
        attendantId: null,
      });

      const { GET } = await importRoute();
      const req = { url: "http://localhost/api/stats" };
      const res = await GET(req);
      const body = await res.json();

      expect(body.recentBySector.farmacia).toBeDefined();
      expect(body.recentBySector.recepcao).toBeDefined();
      expect(body.recentBySector.farmacia).toHaveLength(1);
      expect(body.recentBySector.recepcao).toHaveLength(1);
    });
  });
});
