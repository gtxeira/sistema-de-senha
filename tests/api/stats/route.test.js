import { beforeEach, describe, expect, it, vi } from "vitest";

let db = null;

vi.mock("@/lib/supabase-admin", () => ({
  get isSupabaseAdminConfigured() {
    return false;
  },
  supabaseAdmin: null,
}));

vi.mock("@/lib/supabase", () => ({
  get isSupabaseConfigured() {
    return true;
  },
  get supabase() {
    return db;
  },
}));

function makeChain(result) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
  };
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

async function importRoute() {
  return import("@/app/api/stats/route.js");
}

function buildDb(allData = [], recentData = []) {
  return {
    from: vi.fn(() => makeChain({ data: allData, error: null })),
  };
}

describe("GET /api/stats", () => {
  it("retorna estrutura vazia quando sem banco", async () => {
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
    db = buildDb(calls, calls);

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
    db = buildDb([], []);
    const { GET } = await importRoute();

    const resLow = await GET({ url: "http://localhost/api/stats?days=0" });
    expect((await resLow.json()).days).toBe(30);

    const resHigh = await GET({ url: "http://localhost/api/stats?days=999" });
    expect((await resHigh.json()).days).toBe(90);

    const resDefault = await GET({ url: "http://localhost/api/stats" });
    expect((await resDefault.json()).days).toBe(30);
  });

  it("aplica filtro por setor e data (from/to)", async () => {
    const spies = makeSpyDb();
    db = spies.db;

    const { GET } = await importRoute();
    await GET({
      url: "http://localhost/api/stats?sector=farmacia&from=2025-01-01&to=2025-01-31",
    });

    expect(spies.eq.mock.calls.map((c) => c[0])).toContain("sector_id");
    expect(spies.lte.mock.calls.map((c) => c[0])).toContain("created_at");
    expect(spies.gte.mock.calls.map((c) => c[0])).toContain("created_at");
    expect(spies.limit).toHaveBeenCalledWith(200);
  });

  it("conta chamadas de hoje (today)", async () => {
    const nowCall = { sector_id: "farmacia", type: "normal", created_at: new Date().toISOString() };
    const oldCall = { sector_id: "farmacia", type: "normal", created_at: "2020-01-01T00:00:00.000Z" };
    db = buildDb([nowCall, oldCall], [nowCall, oldCall]);

    const { GET } = await importRoute();
    const res = await GET({ url: "http://localhost/api/stats" });
    const body = await res.json();
    expect(body.summary.total).toBe(2);
    expect(body.summary.today).toBe(1);
  });

  it("aplica cap de 50 por setor em recentBySector", async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      sector_id: "farmacia",
      type: "normal",
      created_at: new Date().toISOString(),
      number_str: `N${i}`,
    }));
    db = buildDb(many, many);

    const { GET } = await importRoute();
    const res = await GET({ url: "http://localhost/api/stats" });
    const body = await res.json();
    expect(body.recentBySector.farmacia.length).toBe(50);
  });

  it("retorna estrutura vazia em erro de consulta", async () => {
    db = { from: vi.fn(() => makeChain({ data: null, error: { message: "boom" } })) };
    const { GET } = await importRoute();
    const res = await GET({ url: "http://localhost/api/stats" });
    const body = await res.json();
    expect(body.noDb).toBe(true);
    expect(body.summary.total).toBe(0);
  });
});

function makeSpyDb() {
  const eq = vi.fn();
  const lte = vi.fn();
  const gte = vi.fn();
  const order = vi.fn();
  const limit = vi.fn();
  function makeChain() {
    const chain = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = eq.mockReturnValue(chain);
    chain.lte = lte.mockReturnValue(chain);
    chain.gte = gte.mockReturnValue(chain);
    chain.order = order.mockReturnValue(chain);
    chain.limit = limit.mockReturnValue(chain);
    chain.then = (resolve) => Promise.resolve({ data: [], error: null }).then(resolve);
    return chain;
  }
  const from = vi.fn(() => makeChain());
  return { db: { from }, eq, lte, gte, order, limit };
}