import { beforeEach, describe, expect, it, vi } from "vitest";

let queueRepo = {
  nextNumber: vi.fn(),
  saveCall: vi.fn(),
};

vi.mock("@/lib/repositories", () => ({
  queue: queueRepo,
}));

import { formatNumberString, normalizeCallType } from "@/lib/repositories/utils";

async function importRoute() {
  return import("@/app/api/queue/call/route.js");
}

function resetMocks() {
  queueRepo.nextNumber.mockReset();
  queueRepo.saveCall.mockReset();
}

describe("POST /api/queue/call", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("retorna 400 com setor inválido", async () => {
    const { POST } = await importRoute();
    const req = { json: vi.fn().mockResolvedValue({ sector: "x", type: "normal" }) };
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("retorna 503 useLocal quando não há clientes", async () => {
    queueRepo.nextNumber.mockRejectedValue({ status: 503, message: "Database not configured" });
    const { POST } = await importRoute();
    const req = { json: vi.fn().mockResolvedValue({ sector: "farmacia", type: "normal" }) };
    const res = await POST(req);
    expect(res.status).toBe(503);
    expect((await res.json()).useLocal).toBe(true);
  });

  it("chama com sucesso e retorna número", async () => {
    queueRepo.nextNumber.mockResolvedValue(7);
    queueRepo.saveCall.mockResolvedValue({ id: "mock-uuid-123" });

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
    expect(queueRepo.saveCall).toHaveBeenCalled();
  });

  it("retorna 500 em erro interno", async () => {
    queueRepo.nextNumber.mockRejectedValue(new Error("erro interno"));

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
});