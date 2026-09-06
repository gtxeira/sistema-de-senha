import { beforeEach, describe, expect, it, vi } from "vitest";

let adminClient = null;
let anonClient = null;
let isAdminConfigured = false;
let isConfigured = false;

vi.mock("@/lib/supabase-admin", () => ({
  get isSupabaseAdminConfigured() {
    return isAdminConfigured;
  },
  get supabaseAdmin() {
    return adminClient;
  },
}));

vi.mock("@/lib/supabase", () => ({
  get isSupabaseConfigured() {
    return isConfigured;
  },
  get supabase() {
    return anonClient;
  },
}));

function chain(result) {
  const c = {
    select: vi.fn(() => c),
    eq: vi.fn(() => c),
    order: vi.fn(() => c),
    limit: vi.fn(() => c),
    single: vi.fn(() => c),
    maybeSingle: vi.fn(() => c),
    insert: vi.fn(() => c),
    update: vi.fn(() => c),
  };
  c.then = (r, j) => Promise.resolve(result).then(r, j);
  return c;
}

async function importRoute() {
  return import("@/app/api/news/route.js");
}

describe("/api/news", () => {
  beforeEach(() => {
    isAdminConfigured = false;
    isConfigured = false;
    adminClient = null;
    anonClient = null;
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_JWT", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig");
  });

  describe("GET", () => {
    it("retorna lista vazia sem banco", async () => {
      const { GET } = await importRoute();
      const res = await GET();
      expect(await res.json()).toEqual({ news: [] });
    });

    it("lista notícias ativas mapeando campos", async () => {
      isConfigured = true;
      anonClient = {
        from: vi.fn(() =>
          chain({ data: [{ id: "1", title: "T", image_url: "u" }], error: null }),
        ),
      };

      const { GET } = await importRoute();
      const res = await GET();
      const body = await res.json();
      expect(body.news).toEqual([{ id: "1", title: "T", image: "u" }]);
    });

    it("retorna lista vazia em erro genérico do banco", async () => {
      isConfigured = true;
      anonClient = {
        from: vi.fn(() =>
          chain({ data: null, error: { message: "boom" } }),
        ),
      };

      const { GET } = await importRoute();
      const res = await GET();
      expect(await res.json()).toEqual({ news: [] });
    });

    it("retorna lista vazia quando tabela inexistente (42P01)", async () => {
      isConfigured = true;
      anonClient = {
        from: vi.fn(() =>
          chain({ data: null, error: { code: "42P01", message: "missing" } }),
        ),
      };

      const { GET } = await importRoute();
      const res = await GET();
      expect(await res.json()).toEqual({ news: [] });
    });
  });

  describe("POST", () => {
    it("retorna 503 sem banco", async () => {
      const { POST } = await importRoute();
      const res = await POST(new Request("http://localhost/api/news"));
      expect(res.status).toBe(503);
    });

    it("retorna 400 sem título", async () => {
      isConfigured = true;
      anonClient = { from: vi.fn() };
      const form = new FormData();
      const { POST } = await importRoute();
      const res = await POST(new Request("http://localhost/api/news", { method: "POST", body: form }));
      expect(res.status).toBe(400);
    });

    it("retorna 400 para tipo de arquivo inválido", async () => {
      isConfigured = true;
      anonClient = { from: vi.fn() };
      const form = new FormData();
      form.append("title", "T");
      form.append("image", new File(["x"], "a.txt", { type: "text/plain" }));
      const { POST } = await importRoute();
      const res = await POST(new Request("http://localhost/api/news", { method: "POST", body: form }));
      expect(res.status).toBe(400);
    });

    it("faz upload e salva notícia", async () => {
      isConfigured = true;

      fetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const from = vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: { id: 1, title: "T", image_url: "u" }, error: null }),
          })),
        })),
      }));
      anonClient = { from };

      const form = new FormData();
      form.append("title", "Notícia");
      form.append("image", new File(["x"], "a.png", { type: "image/png" }));

      const { POST } = await importRoute();
      const res = await POST(new Request("http://localhost/api/news", { method: "POST", body: form }));
      const body = await res.json();
      expect(fetch).toHaveBeenCalled();
      expect(body.news.title).toBe("T");
      expect(res.status).toBe(200);
    });

    it("retorna 500 quando o upload falha permanentemente", async () => {
      isConfigured = true;
      anonClient = { from: vi.fn() };
      fetch.mockResolvedValue({ ok: false, status: 400, text: vi.fn().mockResolvedValue("nope") });

      const form = new FormData();
      form.append("title", "Notícia");
      form.append("image", new File(["x"], "a.png", { type: "image/png" }));

      const { POST } = await importRoute();
      const res = await POST(new Request("http://localhost/api/news", { method: "POST", body: form }));
      expect(res.status).toBe(500);
    });

    it("remove a imagem do Storage quando o insert falha", async () => {
      isConfigured = true;
      fetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const from = vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: "insert boom" } }),
          })),
        })),
      }));
      anonClient = { from };

      const form = new FormData();
      form.append("title", "Notícia");
      form.append("image", new File(["x"], "a.png", { type: "image/png" }));

      const { POST } = await importRoute();
      const res = await POST(new Request("http://localhost/api/news", { method: "POST", body: form }));
      expect(res.status).toBe(500);
      // upload (POST) + deleteFromStorage (DELETE)
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("DELETE", () => {
    it("retorna 400 com id inválido", async () => {
      isConfigured = true;
      anonClient = { from: vi.fn() };
      const { DELETE } = await importRoute();
      const res = await DELETE(new Request("http://localhost/api/news?id=abc"));
      expect(res.status).toBe(400);
    });

    it("exclui notícia com sucesso", async () => {
      isConfigured = true;
      const from = vi.fn();
      from.mockImplementation((table) => {
        if (table === "news") {
          const c = {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { image_url: "u" }, error: null }),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
          };
          return c;
        }
        return chain({ data: [], error: null });
      });
      anonClient = { from };

      const { DELETE } = await importRoute();
      const res = await DELETE(new Request("http://localhost/api/news?id=1"));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    });

    it("não chama Storage quando image_url está fora do bucket", async () => {
      isConfigured = true;
      const from = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: { image_url: "https://externo/x.png" }, error: null }),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      }));
      anonClient = { from };

      const { DELETE } = await importRoute();
      const res = await DELETE(new Request("http://localhost/api/news?id=1"));
      expect(res.status).toBe(200);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("retorna 500 quando o update do banco falha", async () => {
      isConfigured = true;
      const from = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: { message: "update boom" } }),
        })),
      }));
      anonClient = { from };

      const { DELETE } = await importRoute();
      const res = await DELETE(new Request("http://localhost/api/news?id=1"));
      expect(res.status).toBe(500);
    });
  });
});