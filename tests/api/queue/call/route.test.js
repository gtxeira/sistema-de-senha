import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/queue-server", () => ({
  formatNumberString: vi.fn((n, t) => `${t === "preferencial" ? "P" : "N"}${String(n).padStart(3, "0")}`),
  getQueueDbClients: vi.fn(() => []),
  insertQueueCall: vi.fn(),
  isInvalidApiKeyError: vi.fn(() => false),
  nextQueueNumberForSector: vi.fn(),
  normalizeCallType: vi.fn((t) => ({
    sequenceType: t === "preferencial" || t === "preferential" ? "preferencial" : "normal",
    callType: t === "preferencial" || t === "preferential" ? "preferential" : "normal",
  })),
}));

import {
  getQueueDbClients,
  insertQueueCall,
  isInvalidApiKeyError,
  nextQueueNumberForSector,
} from "@/lib/queue-server";

async function importRoute() {
  return import("@/app/api/queue/call/route.js");
}

describe("POST /api/queue/call", () => {
  beforeEach(() => {
    getQueueDbClients.mockReturnValue([]);
    nextQueueNumberForSector.mockReset();
    insertQueueCall.mockReset();
    isInvalidApiKeyError.mockReturnValue(false);
  });

  it("retorna 400 com setor inválido", async () => {
    const { POST } = await importRoute();
    const req = { json: vi.fn().mockResolvedValue({ sector: "x", type: "normal" }) };
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("retorna 503 useLocal quando não há clientes", async () => {
    const { POST } = await importRoute();
    const req = { json: vi.fn().mockResolvedValue({ sector: "farmacia", type: "normal" }) };
    const res = await POST(req);
    expect(res.status).toBe(503);
    expect((await res.json()).useLocal).toBe(true);
  });

  it("chama com sucesso e retorna número", async () => {
    getQueueDbClients.mockReturnValue([{ __db: 1 }]);
    nextQueueNumberForSector.mockResolvedValue(7);
    insertQueueCall.mockResolvedValue(undefined);

    const { POST } = await importRoute();
    const req = {
      json: vi.fn().mockResolvedValue({ sector: "farmacia", type: "preferencial", attendantId: null }),
    };
    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.number).toBe(7);
    expect(body.type).toBe("preferencial");
    expect(insertQueueCall).toHaveBeenCalled();
  });

  it("retorna 500 em erro interno não de api key", async () => {
    getQueueDbClients.mockReturnValue([{ __db: 1 }]);
    nextQueueNumberForSector.mockRejectedValue(new Error("erro interno"));
    isInvalidApiKeyError.mockReturnValue(false);

    const { POST } = await importRoute();
    const req = { json: vi.fn().mockResolvedValue({ sector: "farmacia", type: "normal" }) };
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it("retorna 500 em JSON inválido", async () => {
    const { POST } = await importRoute();
    const req = { json: vi.fn().mockRejectedValue(new Error("bad json")) };
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it("faz fallback entre clients quando o primeiro tem chave inválida", async () => {
    getQueueDbClients.mockReturnValue([{ __db: 1 }, { __db: 2 }]);
    nextQueueNumberForSector
      .mockRejectedValueOnce(new Error("invalid api key"))
      .mockResolvedValueOnce(5);
    insertQueueCall.mockResolvedValue();
    isInvalidApiKeyError.mockReturnValue(true);

    const { POST } = await importRoute();
    const req = { json: vi.fn().mockResolvedValue({ sector: "farmacia", type: "normal" }) };
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.number).toBe(5);
    expect(nextQueueNumberForSector).toHaveBeenCalledTimes(2);
    expect(nextQueueNumberForSector.mock.calls[0][0]).toEqual({ __db: 1 });
    expect(nextQueueNumberForSector.mock.calls[1][0]).toEqual({ __db: 2 });
  });

  it("retorna 503 useLocal quando todos os clients falham por chave", async () => {
    getQueueDbClients.mockReturnValue([{ __db: 1 }]);
    nextQueueNumberForSector.mockRejectedValue(new Error("invalid api key"));
    isInvalidApiKeyError.mockReturnValue(true);

    const { POST } = await importRoute();
    const req = { json: vi.fn().mockResolvedValue({ sector: "farmacia", type: "normal" }) };
    const res = await POST(req);

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.useLocal).toBe(true);
  });
});