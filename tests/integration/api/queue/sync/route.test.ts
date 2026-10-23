import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { routeRequest } from "../../../../helpers/http";
import { readJson } from "@/shared/json";
import type { QueueSyncBody } from "@/shared/types/api";
import {
  cleanupQueueTestData,
  prisma,
} from "../../../postgres-setup";

async function importRoute() {
  return import("@/app/api/queue/sync/route");
}

describe("/api/queue/sync — integration", () => {
  beforeEach(async () => {
    await cleanupQueueTestData();
  });

  afterEach(async () => {
    await cleanupQueueTestData();
  });

  describe("POST", () => {
    it("retorna 400 sem setor", async () => {
      const { POST } = await importRoute();
      const req = routeRequest("http://localhost/api/queue/sync", { type: "normal", nextNumber: 10 });
      const res = await POST(req);

      expect(res.status).toBe(400);
    });

    it("retorna 400 com setor inválido", async () => {
      const { POST } = await importRoute();
      const req = routeRequest("http://localhost/api/queue/sync", { sector: "invalido", type: "normal", nextNumber: 10 });
      const res = await POST(req);

      expect(res.status).toBe(400);
    });

    it("retorna 400 com número < 0", async () => {
      const { POST } = await importRoute();
      const req = routeRequest("http://localhost/api/queue/sync", { sector: "farmacia", type: "normal", nextNumber: -1 });
      const res = await POST(req);

      expect(res.status).toBe(400);
    });

    it("retorna 400 com número > 999", async () => {
      const { POST } = await importRoute();
      const req = routeRequest("http://localhost/api/queue/sync", {
            sector: "farmacia",
            type: "normal",
            nextNumber: 1000,
          });
      const res = await POST(req);

      expect(res.status).toBe(400);
    });

    it("retorna 400 sem número", async () => {
      const { POST } = await importRoute();
      const req = routeRequest("http://localhost/api/queue/sync", { sector: "farmacia", type: "normal" });
      const res = await POST(req);

      expect(res.status).toBe(400);
    });

    it("sincroniza com sucesso (farmacia, normal)", async () => {
      const { POST } = await importRoute();
      const req = routeRequest("http://localhost/api/queue/sync", {
            sector: "farmacia",
            type: "normal",
            nextNumber: 45,
          });
      const res = await POST(req);
      const body = await readJson<QueueSyncBody>(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.sector).toBe("farmacia");
      expect(body.type).toBe("normal");
      expect(body.nextNumber).toBe(45);
      expect(body.numberStr).toBe("N045");
    });

    it("sincroniza com sucesso (recepcao, preferencial)", async () => {
      const { POST } = await importRoute();
      const req = routeRequest("http://localhost/api/queue/sync", {
            sector: "recepcao",
            type: "preferencial",
            nextNumber: 100,
          });
      const res = await POST(req);
      const body = await readJson<QueueSyncBody>(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.sector).toBe("recepcao");
      expect(body.type).toBe("preferencial");
      expect(body.nextNumber).toBe(100);
      expect(body.numberStr).toBe("P100");
    });

    it("persiste o número no banco de dados", async () => {
      const { POST } = await importRoute();
      const req = routeRequest("http://localhost/api/queue/sync", {
            sector: "farmacia",
            type: "normal",
            nextNumber: 45,
          });
      await POST(req);

      const seq = await prisma.queue_sequences.findUnique({
        where: {
          sector_id_call_type: { sector_id: "farmacia", call_type: "normal" },
        },
      });
      expect(seq?.current_number).toBe(44);
    });

    it("permite chamar senha após sincronização", async () => {
      const { POST: syncPost } = await importRoute();
      const syncReq = routeRequest("http://localhost/api/queue/sync", {
            sector: "farmacia",
            type: "normal",
            nextNumber: 45,
          });
      await syncPost(syncReq);

      const { queue } = await import("@/server/repositories");
      const result = await queue.nextNumber("farmacia", "normal");

      expect(result.number).toBe(45);
    });
  });
});
