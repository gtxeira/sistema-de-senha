import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanupQueueTestData } from "../../../postgres-setup.js";
import { eventManager } from "@/lib/event-manager";

async function importCallRoute() {
  return import("@/app/api/queue/call/route.js");
}

async function importRecallRoute() {
  return import("@/app/api/queue/recall/route.js");
}

async function importQueueRepo() {
  const mod = await import("@/lib/repositories");
  return mod.queue;
}

describe("/api/queue/recall — integration", () => {
  beforeEach(async () => {
    await cleanupQueueTestData();
  });

  afterEach(async () => {
    await cleanupQueueTestData();
  });

  describe("POST", () => {
    it("retorna 400 sem setor", async () => {
      const { POST } = await importRecallRoute();
      const req = {
        json: () => Promise.resolve({}),
      };
      const res = await POST(req);

      expect(res.status).toBe(400);
    });

    it("retorna 400 com setor inválido", async () => {
      const { POST } = await importRecallRoute();
      const req = {
        json: () => Promise.resolve({ sector: "invalido" }),
      };
      const res = await POST(req);

      expect(res.status).toBe(400);
    });

    it("retorna 404 quando não há chamadas anteriores", async () => {
      const { POST } = await importRecallRoute();
      const req = {
        json: () => Promise.resolve({ sector: "farmacia" }),
      };
      const res = await POST(req);

      expect(res.status).toBe(404);
    });

    it("retorna 200 com sucesso e dados da última chamada", async () => {
      const { POST: callPOST } = await importCallRoute();
      const callReq = {
        json: () =>
          Promise.resolve({ sector: "farmacia", type: "normal", attendantId: null }),
      };
      await callPOST(callReq);

      const { POST } = await importRecallRoute();
      const req = {
        json: () => Promise.resolve({ sector: "farmacia" }),
      };
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.number).toBe(1);
      expect(body.type).toBe("normal");
    });

    it("emite evento emitQueueRecall (não emitQueueCall)", async () => {
      const { POST: callPOST } = await importCallRoute();
      const callReq = {
        json: () =>
          Promise.resolve({ sector: "farmacia", type: "normal", attendantId: null }),
      };
      await callPOST(callReq);

      let receivedCall = null;
      let receivedRecall = null;

      const unsubCall = eventManager.subscribeToQueue("farmacia", (call) => {
        receivedCall = call;
      });
      const unsubRecall = eventManager.subscribeToRecall("farmacia", (call) => {
        receivedRecall = call;
      });

      try {
        const { POST } = await importRecallRoute();
        const req = {
          json: () => Promise.resolve({ sector: "farmacia" }),
        };
        await POST(req);

        expect(receivedCall).toBeNull();
        expect(receivedRecall).not.toBeNull();
        expect(receivedRecall.number).toBe(1);
        expect(receivedRecall.type).toBe("normal");
        expect(receivedRecall.time).toBeDefined();
      } finally {
        unsubCall();
        unsubRecall();
      }
    });

    it("retorna o número e tipo da última chamada", async () => {
      const { POST: callPOST } = await importCallRoute();

      const callReq1 = {
        json: () =>
          Promise.resolve({ sector: "farmacia", type: "normal", attendantId: null }),
      };
      await callPOST(callReq1);

      const callReq2 = {
        json: () =>
          Promise.resolve({ sector: "farmacia", type: "preferencial", attendantId: null }),
      };
      await callPOST(callReq2);

      const { POST } = await importRecallRoute();
      const req = {
        json: () => Promise.resolve({ sector: "farmacia" }),
      };
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.number).toBe(2);
      expect(body.type).toBe("preferencial");
    });
  });
});
