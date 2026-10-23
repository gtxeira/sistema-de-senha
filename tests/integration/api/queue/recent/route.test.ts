import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { authMock } from "../../../../helpers/auth-mock";
import { cleanupQueueTestData } from "../../../postgres-setup";
import { readJson } from "@/shared/json";
import type { QueueRecentBody } from "@/shared/types/api";

async function importRoute() {
  return import("@/app/api/queue/recent/route");
}

async function importQueueRepo() {
  const mod = await import("@/server/repositories");
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
      const req = new Request("http://localhost/api/queue/recent");
      const res = await GET(req);

      expect(res.status).toBe(400);
    });

    it("retorna 400 com setor inválido", async () => {
      const { GET } = await importRoute();
      const req = new Request("http://localhost/api/queue/recent?sector=invalido");
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
      const req = new Request("http://localhost/api/queue/recent?sector=farmacia");
      const res = await GET(req);
      const body = await readJson<QueueRecentBody>(res);

      expect(res.status).toBe(200);
      expect(body.calls).toHaveLength(2);
      expect(body.calls[0]).toHaveProperty("id");
      expect(body.calls[0]).toHaveProperty("number");
      expect(body.calls[0]).toHaveProperty("type");
      // O INSTANTE (ISO), não "HH:mm".
      expect(body.calls[0]).toHaveProperty("createdAt");
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
      const req = new Request("http://localhost/api/queue/recent?sector=farmacia&limit=2");
      const res = await GET(req);
      const body = await readJson<QueueRecentBody>(res);

      expect(res.status).toBe(200);
      expect(body.calls).toHaveLength(2);
    });

    it("retorna vazio quando não há chamadas", async () => {
      const { GET } = await importRoute();
      const req = new Request("http://localhost/api/queue/recent?sector=farmacia");
      const res = await GET(req);
      const body = await readJson<QueueRecentBody>(res);

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
      const req = new Request("http://localhost/api/queue/recent?sector=farmacia");
      const res = await GET(req);
      const body = await readJson<QueueRecentBody>(res);

      expect(res.status).toBe(200);
      expect(body.calls).toHaveLength(1);
    });
  });

  describe("marcador de reset", () => {
    it("devolve resetAt null quando o setor nunca foi resetado", async () => {
      const { GET } = await importRoute();
      const res = await GET(new Request("http://localhost/api/queue/recent?sector=farmacia"));
      const body = await readJson<QueueRecentBody>(res);

      expect(res.status).toBe(200);
      expect(body.resetAt).toBeNull();
    });

    it("devolve resetAt em ISO após um reset", async () => {
      const repo = await importQueueRepo();
      await repo.resetSector("farmacia");

      const { GET } = await importRoute();
      const res = await GET(new Request("http://localhost/api/queue/recent?sector=farmacia"));
      const body = await readJson<QueueRecentBody>(res);

      expect(res.status).toBe(200);
      expect(typeof body.resetAt).toBe("string");
      expect(new Date(body.resetAt ?? "").toString()).not.toBe("Invalid Date");
    });

    it("o marcador muda entre resets", async () => {
      const repo = await importQueueRepo();
      const { GET } = await importRoute();

      await repo.resetSector("farmacia");
      const first = (await readJson<QueueRecentBody>(await GET(new Request("http://localhost/api/queue/recent?sector=farmacia")))).resetAt ?? "";

      await repo.resetSector("farmacia");
      const second = (await readJson<QueueRecentBody>(await GET(new Request("http://localhost/api/queue/recent?sector=farmacia")))).resetAt ?? "";

      expect(new Date(second).getTime()).toBeGreaterThan(new Date(first).getTime());
    });

    it("não devolve as chamadas anteriores ao reset", async () => {
      const repo = await importQueueRepo();
      await repo.saveCall({
        sector: "farmacia",
        number: 1,
        numberStr: "N001",
        sequenceType: "normal",
        callType: "normal",
        attendantId: null,
      });

      await repo.resetSector("farmacia");

      const { GET } = await importRoute();
      const res = await GET(new Request("http://localhost/api/queue/recent?sector=farmacia"));
      const body = await readJson<QueueRecentBody>(res);

      // A linha sobrevive no banco (o /historico continua funcionando), mas
      // não pode voltar para a fila do monitor.
      expect(body.calls).toEqual([]);
      expect(body.resetAt).not.toBeNull();
    });

    it("devolve as chamadas feitas depois do reset", async () => {
      const repo = await importQueueRepo();
      await repo.saveCall({
        sector: "farmacia",
        number: 1,
        numberStr: "N001",
        sequenceType: "normal",
        callType: "normal",
        attendantId: null,
      });
      await repo.resetSector("farmacia");
      await repo.saveCall({
        sector: "farmacia",
        number: 1,
        numberStr: "N001",
        sequenceType: "normal",
        callType: "normal",
        attendantId: null,
      });

      const { GET } = await importRoute();
      const res = await GET(new Request("http://localhost/api/queue/recent?sector=farmacia"));
      const body = await readJson<QueueRecentBody>(res);

      expect(body.calls).toHaveLength(1);
    });
  });

  describe("autenticação", () => {
    it("retorna 401 sem sessão", async () => {
      authMock.mockResolvedValueOnce(null);

      const { GET } = await importRoute();
      const res = await GET(new Request("http://localhost/api/queue/recent?sector=farmacia"));

      expect(res.status).toBe(401);
    });

    it("atende qualquer usuário autenticado (inclusive atendente)", async () => {
      const now = Date.now();
      authMock.mockResolvedValueOnce({
        user: {
          id: "u1",
          name: "Atendente",
          sector: "farmacia",
          permissions: [],
          authAt: now,
          permsAt: now,
        },
      });

      const { GET } = await importRoute();
      const res = await GET(new Request("http://localhost/api/queue/recent?sector=farmacia"));

      expect(res.status).toBe(200);
    });
  });
});
