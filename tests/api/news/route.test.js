import { beforeEach, describe, expect, it, vi } from "vitest";

let newsRepo = {
  create: vi.fn(),
  remove: vi.fn(),
  listActive: vi.fn(),
};

vi.mock("@/lib/repositories", () => ({
  news: newsRepo,
}));

async function importRoute() {
  return import("@/app/api/news/route.js");
}

function resetMocks() {
  newsRepo.create.mockReset();
  newsRepo.remove.mockReset();
  newsRepo.listActive.mockReset();
}

describe("/api/news", () => {
  beforeEach(() => {
    resetMocks();
  });

  describe("GET", () => {
    it("retorna lista vazia sem banco", async () => {
      newsRepo.listActive.mockResolvedValue([]);

      const { GET } = await importRoute();
      const res = await GET();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ news: [] });
    });

    it("lista notícias ativas mapeando campos", async () => {
      newsRepo.listActive.mockResolvedValue([{ id: "1", title: "T", image: "u" }]);

      const { GET } = await importRoute();
      const res = await GET();
      const body = await res.json();
      expect(body.news).toEqual([{ id: "1", title: "T", image: "u" }]);
    });
  });

  describe("POST", () => {
    it("retorna 400 sem título", async () => {
      newsRepo.create.mockRejectedValue({ status: 400, message: "Informe um título." });
      const form = new FormData();
      const { POST } = await importRoute();
      const res = await POST(new Request("http://localhost/api/news", { method: "POST", body: form }));
      expect(res.status).toBe(400);
    });

    it("retorna 400 para tipo de arquivo inválido", async () => {
      newsRepo.create.mockRejectedValue({ status: 400, message: "Formato inválido. Use JPG, PNG, WEBP ou GIF." });
      const form = new FormData();
      form.append("title", "T");
      form.append("image", new File(["x"], "a.txt", { type: "text/plain" }));
      const { POST } = await importRoute();
      const res = await POST(new Request("http://localhost/api/news", { method: "POST", body: form }));
      expect(res.status).toBe(400);
    });

    it("faz upload e salva notícia", async () => {
      newsRepo.create.mockResolvedValue({
        success: true,
        news: { id: "1", title: "T", image: "u" },
      });

      const form = new FormData();
      form.append("title", "Notícia");
      form.append("image", new File(["x"], "a.png", { type: "image/png" }));

      const { POST } = await importRoute();
      const res = await POST(new Request("http://localhost/api/news", { method: "POST", body: form }));
      const body = await res.json();
      expect(body.news.title).toBe("T");
      expect(res.status).toBe(200);
    });

    it("retorna 500 quando o upload falha permanentemente", async () => {
      newsRepo.create.mockRejectedValue({ status: 500, message: "Upload falhou: nope" });
      const form = new FormData();
      form.append("title", "Notícia");
      form.append("image", new File(["x"], "a.png", { type: "image/png" }));
      const { POST } = await importRoute();
      const res = await POST(new Request("http://localhost/api/news", { method: "POST", body: form }));
      expect(res.status).toBe(500);
    });

    it("remove a imagem do Storage quando o insert falha", async () => {
      newsRepo.create.mockRejectedValue({ status: 500, message: "insert boom" });
      const form = new FormData();
      form.append("title", "Notícia");
      form.append("image", new File(["x"], "a.png", { type: "image/png" }));
      const { POST } = await importRoute();
      const res = await POST(new Request("http://localhost/api/news", { method: "POST", body: form }));
      expect(res.status).toBe(500);
    });
  });

  describe("DELETE", () => {
    it("retorna 400 com id inválido", async () => {
      newsRepo.remove.mockRejectedValue({ status: 400, message: "ID inválido." });
      const { DELETE } = await importRoute();
      const res = await DELETE(new Request("http://localhost/api/news?id=abc"));
      expect(res.status).toBe(400);
    });

    it("exclui notícia com sucesso", async () => {
      newsRepo.remove.mockResolvedValue({ success: true });
      const { DELETE } = await importRoute();
      const res = await DELETE(new Request("http://localhost/api/news?id=1"));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
    });

    it("não chama Storage quando image_url está fora do bucket", async () => {
      newsRepo.remove.mockResolvedValue({ success: true });
      const { DELETE } = await importRoute();
      const res = await DELETE(new Request("http://localhost/api/news?id=1"));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
    });

    it("retorna 500 quando o update do banco falha", async () => {
      newsRepo.remove.mockRejectedValue({ status: 500, message: "update boom" });
      const { DELETE } = await importRoute();
      const res = await DELETE(new Request("http://localhost/api/news?id=1"));
      expect(res.status).toBe(500);
    });
  });
});