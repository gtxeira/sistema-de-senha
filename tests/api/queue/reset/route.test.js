import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/queue-server", () => ({
  getQueueDb: vi.fn(() => null),
  resetSectorSequence: vi.fn(),
}));

import { getQueueDb, resetSectorSequence } from "@/lib/queue-server";

async function importRoute() {
  return import("@/app/api/queue/reset/route.js");
}

describe("POST /api/queue/reset", () => {
  beforeEach(() => {
    getQueueDb.mockReturnValue(null);
    resetSectorSequence.mockReset();
  });

  it("retorna 400 sem setor", async () => {
    const { POST } = await importRoute();
    const res = await POST({ json: vi.fn().mockResolvedValue({}) });
    expect(res.status).toBe(400);
  });

  it("retorna 400 para setor inválido", async () => {
    const { POST } = await importRoute();
    const res = await POST({ json: vi.fn().mockResolvedValue({ sector: "x" }) });
    expect(res.status).toBe(400);
  });

  it("retorna localOnly quando sem banco", async () => {
    const { POST } = await importRoute();
    const res = await POST({ json: vi.fn().mockResolvedValue({ sector: "farmacia" }) });
    expect(res.status).toBe(200);
    expect((await res.json()).localOnly).toBe(true);
  });

  it("reseta setor único", async () => {
    getQueueDb.mockReturnValue({ __db: 1 });
    resetSectorSequence.mockResolvedValue(undefined);

    const { POST } = await importRoute();
    const res = await POST({ json: vi.fn().mockResolvedValue({ sector: "farmacia" }) });
    expect(res.status).toBe(200);
    expect(resetSectorSequence).toHaveBeenCalledWith({ __db: 1 }, "farmacia");
  });

  it("reseta todos os setores com 'all'", async () => {
    getQueueDb.mockReturnValue({ __db: 1 });
    resetSectorSequence.mockResolvedValue(undefined);

    const { POST } = await importRoute();
    const res = await POST({ json: vi.fn().mockResolvedValue({ sector: "all" }) });
    expect(res.status).toBe(200);
    expect(resetSectorSequence).toHaveBeenCalledTimes(2);
    const body = await res.json();
    expect(body.sectors).toEqual(["farmacia", "recepcao"]);
  });

  it("retorna 500 quando reset falha", async () => {
    getQueueDb.mockReturnValue({ __db: 1 });
    resetSectorSequence.mockRejectedValue(new Error("reset boom"));

    const { POST } = await importRoute();
    const res = await POST({ json: vi.fn().mockResolvedValue({ sector: "farmacia" }) });
    expect(res.status).toBe(500);
  });

  it("retorna 500 para JSON inválido", async () => {
    const { POST } = await importRoute();
    const res = await POST({ json: vi.fn().mockRejectedValue(new Error("bad json")) });
    expect(res.status).toBe(500);
  });
});