import { beforeEach, describe, expect, it, vi } from "vitest";

let queueRepo = {
  resetSector: vi.fn(),
};

vi.mock("@/lib/repositories", () => ({
  queue: queueRepo,
}));

async function importRoute() {
  return import("@/app/api/queue/reset/route.js");
}

describe("POST /api/queue/reset", () => {
  beforeEach(() => {
    queueRepo.resetSector.mockReset();
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
    queueRepo.resetSector.mockRejectedValue(new Error("Database not configured"));
    const { POST } = await importRoute();
    const res = await POST({ json: vi.fn().mockResolvedValue({ sector: "farmacia" }) });
    expect(res.status).toBe(500);
  });

  it("reseta setor único", async () => {
    queueRepo.resetSector.mockResolvedValue(undefined);

    const { POST } = await importRoute();
    const res = await POST({ json: vi.fn().mockResolvedValue({ sector: "farmacia" }) });
    expect(res.status).toBe(200);
    expect(queueRepo.resetSector).toHaveBeenCalledWith("farmacia");
  });

  it("reseta todos os setores com 'all'", async () => {
    queueRepo.resetSector.mockResolvedValue(undefined);

    const { POST } = await importRoute();
    const res = await POST({ json: vi.fn().mockResolvedValue({ sector: "all" }) });
    expect(res.status).toBe(200);
    expect(queueRepo.resetSector).toHaveBeenCalledTimes(2);
    const body = await res.json();
    expect(body.sectors).toEqual(["farmacia", "recepcao"]);
  });

  it("retorna 500 quando reset falha", async () => {
    queueRepo.resetSector.mockRejectedValue(new Error("reset boom"));

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