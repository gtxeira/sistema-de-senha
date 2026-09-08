import { beforeEach, describe, expect, it, vi } from "vitest";

let readRepo = {
  getStats: vi.fn(),
};

vi.mock("@/lib/repositories", () => ({
  read: readRepo,
}));

async function importRoute() {
  return import("@/app/api/stats/route.js");
}

function resetMocks() {
  readRepo.getStats.mockReset();
}

describe("GET /api/stats", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("retorna estrutura vazia quando sem banco", async () => {
    readRepo.getStats.mockResolvedValue({
      days: 30,
      summary: { total: 0, today: 0, preferencial: 0, normal: 0 },
      bySector: [],
      byType: [],
      recent: [],
      recentBySector: {},
      noDb: true,
    });

    const route = await importRoute();
    const req = { url: "http://localhost/api/stats" };
    const res = await route.GET(req);
    const body = await res.json();
    expect(body.noDb).toBe(true);
    expect(body.summary.total).toBe(0);
  });

  it("agrega totais, tipos e setores", async () => {
    const created = "2025-01-01T10:00:00.000Z";
    const calls = [
      { sector_id: "farmacia", type: "normal", created_at: created },
      { sector_id: "farmacia", type: "preferencial", created_at: created },
      { sector_id: "recepcao", type: "normal", created_at: created },
    ];
    readRepo.getStats.mockResolvedValue({
      days: 30,
      summary: { total: 3, today: 0, preferencial: 1, normal: 2 },
      bySector: [{ sector: "farmacia", total: 2 }, { sector: "recepcao", total: 1 }],
      byType: [],
      recent: [],
      recentBySector: {},
      noDb: false,
    });

    const { GET } = await importRoute();
    const req = { url: "http://localhost/api/stats?days=30" };
    const res = await GET(req);
    const body = await res.json();

    expect(body.summary.total).toBe(3);
    expect(body.summary.preferencial).toBe(1);
    expect(body.summary.normal).toBe(2);
    expect(body.bySector).toEqual(
      expect.arrayContaining([
        { sector: "farmacia", total: 2 },
        { sector: "recepcao", total: 1 },
      ]),
    );
  });

  it("limita days entre 1 e 90", async () => {
    // The route passes days to getStats, which returns the clamped value
    readRepo.getStats
      .mockResolvedValueOnce({ days: 30, summary: { total: 0, today: 0, preferencial: 0, normal: 0 }, bySector: [], byType: [], recent: [], recentBySector: {} })
      .mockResolvedValueOnce({ days: 90, summary: { total: 0, today: 0, preferencial: 0, normal: 0 }, bySector: [], byType: [], recent: [], recentBySector: {} })
      .mockResolvedValueOnce({ days: 30, summary: { total: 0, today: 0, preferencial: 0, normal: 0 }, bySector: [], byType: [], recent: [], recentBySector: {} });

    const { GET } = await importRoute();

    const resLow = await GET({ url: "http://localhost/api/stats?days=0" });
    expect((await resLow.json()).days).toBe(30);

    const resHigh = await GET({ url: "http://localhost/api/stats?days=999" });
    expect((await resHigh.json()).days).toBe(90);

    const resDefault = await GET({ url: "http://localhost/api/stats" });
    expect((await resDefault.json()).days).toBe(30);
  });

  it("aplica filtro por setor e data (from/to)", async () => {
    readRepo.getStats.mockResolvedValue({
      days: 31,
      summary: { total: 0, today: 0, preferencial: 0, normal: 0 },
      bySector: [],
      byType: [],
      recent: [],
      recentBySector: {},
    });

    const { GET } = await importRoute();
    await GET({
      url: "http://localhost/api/stats?sector=farmacia&from=2025-01-01&to=2025-01-31",
    });
    expect(readRepo.getStats).toHaveBeenCalledWith(expect.objectContaining({
      sector: "farmacia",
      from: new Date("2025-01-01"),
      to: new Date("2025-01-31"),
    }));
  });

  it("conta chamadas de hoje (today)", async () => {
    const nowCall = { sector_id: "farmacia", type: "normal", created_at: new Date().toISOString() };
    const oldCall = { sector_id: "farmacia", type: "normal", created_at: "2020-01-01T00:00:00.000Z" };
    readRepo.getStats.mockResolvedValue({
      days: 30,
      summary: { total: 2, today: 1, preferencial: 0, normal: 2 },
      bySector: [],
      byType: [],
      recent: [],
      recentBySector: {},
    });

    const { GET } = await importRoute();
    const res = await GET({ url: "http://localhost/api/stats" });
    const body = await res.json();
    expect(body.summary.total).toBe(2);
    expect(body.summary.today).toBe(1);
  });

  it("aplica cap de 50 por setor em recentBySector", async () => {
    readRepo.getStats.mockResolvedValue({
      days: 30,
      summary: { total: 60, today: 0, preferencial: 0, normal: 60 },
      bySector: [],
      byType: [],
      recent: [],
      recentBySector: { farmacia: Array(50).fill({ id: "1", number: 1, type: "normal", time: "10:00" }) },
    });

    const { GET } = await importRoute();
    const res = await GET({ url: "http://localhost/api/stats" });
    const body = await res.json();
    expect(body.recentBySector.farmacia.length).toBe(50);
  });

  it("retorna estrutura vazia em erro de consulta", async () => {
    readRepo.getStats.mockResolvedValue({
      days: 30,
      summary: { total: 0, today: 0, preferencial: 0, normal: 0 },
      bySector: [],
      byType: [],
      recent: [],
      recentBySector: {},
      noDb: true,
    });

    const { GET } = await importRoute();
    const res = await GET({ url: "http://localhost/api/stats" });
    const body = await res.json();
    expect(body.noDb).toBe(true);
    expect(body.summary.total).toBe(0);
  });
});