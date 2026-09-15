import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanupQueueTestData } from "../../../postgres-setup.js";

async function importRoute() {
  return import("@/app/api/queue/recent/route.js");
}

async function importQueueRepo() {
  const mod = await import("@/lib/repositories");
  return mod.queue;
}

describe("/api/queue/recent — integration", () => {
  beforeEach(async () => {
    await cleanupQueueTestData();
  });

  afterEach(async () => {
    await cleanupQueueTestData();
  });

  describe("GET", () => {
    it("retorna 400 sem setor", async () => {
      const { GET } = await importRoute();
      const req = { url: "http://localhost/api/queue/recent" };
      const res = await GET(req);

      expect(res.status).toBe(400);
    });

    it("retorna 400 com setor inválido", async () => {
      const { GET } = await importRoute();
      const req = { url: "http://localhost/api/queue/recent?sector=invalido" };
      const res = await GET(req);

      expect(res.status).toBe(400);
    });

    it("retorna chamadas recentes do setor", async () => {
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

      const { GET } = await importRoute();
      const req = { url: "http://localhost/api/queue/recent?sector=farmacia" };
      const res = await GET(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.calls).toHaveLength(2);
      expect(body.calls[0]).toHaveProperty("id");
      expect(body.calls[0]).toHaveProperty("number");
      expect(body.calls[0]).toHaveProperty("type");
      expect(body.calls[0]).toHaveProperty("time");
    });

    it("respeta limite (limit)", async () => {
      const repo = await importQueueRepo();
      for (let i = 1; i <= 5; i++) {
        await repo.saveCall({
          sector: "farmacia",
          number: i,
          numberStr: `N${String(i).padStart(3, "0")}`,
          sequenceType: "normal",
          callType: "normal",
          attendantId: null,
        });
      }

      const { GET } = await importRoute();
      const req = { url: "http://localhost/api/queue/recent?sector=farmacia&limit=2" };
      const res = await GET(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.calls).toHaveLength(2);
    });

    it("retorna vazio quando não há chamadas", async () => {
      const { GET } = await importRoute();
      const req = { url: "http://localhost/api/queue/recent?sector=farmacia" };
      const res = await GET(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.calls).toEqual([]);
    });

    it("retorna apenas chamadas do setor solicitado", async () => {
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
      const req = { url: "http://localhost/api/queue/recent?sector=farmacia" };
      const res = await GET(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.calls).toHaveLength(1);
    });
  });
});
