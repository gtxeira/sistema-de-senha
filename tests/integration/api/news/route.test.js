import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { seedTestNews, cleanupTestNews, cleanupAllNews } from "../../postgres-setup.js";
import { unlink, access } from "node:fs/promises";
import { join } from "node:path";

const NEWS_DIR = join(process.cwd(), "public", "news");

let createdIds = [];
let createdFiles = [];

async function importRoute() {
  return import("@/app/api/news/route.js");
}

async function importNewsRepo() {
  const mod = await import("@/lib/repositories");
  return mod.news;
}

function makeImage({ name = "test.jpg", type = "image/jpeg", size = 1024 } = {}) {
  const data = new Uint8Array(size);
  return new File([data], name, { type });
}

async function cleanupFiles() {
  for (const file of createdFiles) {
    await unlink(join(NEWS_DIR, file)).catch(() => {});
  }
  createdFiles = [];
}

describe("/api/news — integration", () => {
  beforeEach(() => {
    createdIds = [];
    createdFiles = [];
  });

  afterEach(async () => {
    await cleanupFiles();
    await cleanupTestNews(createdIds);
    createdIds = [];
  });

  describe("GET", () => {
    it("retorna lista de notícias ativas", async () => {
      const repo = await importNewsRepo();
      const result = await repo.create({
        title: "Notícia GET Teste",
        image: makeImage({ name: "get-test.jpg" }),
      });
      createdIds.push(Number(result.news.id));
      createdFiles.push(result.news.image.replace("/news/", ""));

      const { GET } = await importRoute();
      const res = await GET();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(Array.isArray(body.news)).toBe(true);
      const found = body.news.find((n) => n.id === result.news.id);
      expect(found).toBeDefined();
      expect(found.title).toBe("Notícia GET Teste");
      expect(found.image).toMatch(/^\/news\//);
    });

    it("não retorna notícias inativas", async () => {
      const repo = await importNewsRepo();
      const result = await repo.create({
        title: "Inativa Teste",
        image: makeImage({ name: "inativa-test.jpg" }),
      });
      createdIds.push(Number(result.news.id));
      createdFiles.push(result.news.image.replace("/news/", ""));

      await repo.remove(result.news.id);

      const { GET } = await importRoute();
      const res = await GET();
      const body = await res.json();

      expect(res.status).toBe(200);
      const found = body.news.find((n) => n.id === result.news.id);
      expect(found).toBeUndefined();
    });

    it("retorna no máximo 10 notícias", async () => {
      await cleanupAllNews();
      for (let i = 0; i < 12; i++) {
        const { id } = await seedTestNews({ title: `Max News ${i}` });
        createdIds.push(id);
      }

      const { GET } = await importRoute();
      const res = await GET();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.news).toHaveLength(10);
    });

    it("retorna notícias ordenadas por created_at desc", async () => {
      await cleanupAllNews();
      const older = await seedTestNews({
        title: "Mais antiga",
        created_at: new Date("2020-01-01"),
      });
      const newer = await seedTestNews({
        title: "Mais recente",
        created_at: new Date("2030-01-01"),
      });
      createdIds.push(older.id, newer.id);

      const { GET } = await importRoute();
      const res = await GET();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.news[0].title).toBe("Mais recente");
      expect(body.news[1].title).toBe("Mais antiga");
    });
  });

  describe("POST", () => {
    it("retorna 400 sem título", async () => {
      const form = new FormData();
      form.append("image", makeImage());

      const { POST } = await importRoute();
      const res = await POST(
        new Request("http://localhost/api/news", { method: "POST", body: form })
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Título e imagem são obrigatórios");
    });

    it("retorna 400 sem imagem", async () => {
      const form = new FormData();
      form.append("title", "Teste");

      const { POST } = await importRoute();
      const res = await POST(
        new Request("http://localhost/api/news", { method: "POST", body: form })
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Título e imagem são obrigatórios");
    });

    it("retorna 400 para formato de arquivo inválido", async () => {
      const form = new FormData();
      form.append("title", "Teste");
      form.append("image", new File(["x"], "doc.pdf", { type: "application/pdf" }));

      const { POST } = await importRoute();
      const res = await POST(
        new Request("http://localhost/api/news", { method: "POST", body: form })
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/Formato inválido/i);
    });

    it("cria notícia, salva no banco e retorna dados", async () => {
      const form = new FormData();
      form.append("title", "Minha Notícias");
      form.append("image", makeImage({ name: "foto.jpg", type: "image/jpeg" }));

      const { POST } = await importRoute();
      const res = await POST(
        new Request("http://localhost/api/news", { method: "POST", body: form })
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.news.title).toBe("Minha Notícias");
      expect(body.news.id).toBeDefined();
      expect(body.news.image).toMatch(/^\/news\//);

      createdIds.push(Number(body.news.id));
      createdFiles.push(body.news.image.replace("/news/", ""));

      const repo = await importNewsRepo();
      const list = await repo.listActive();
      const found = list.find((n) => n.id === body.news.id);
      expect(found).toBeDefined();
      expect(found.title).toBe("Minha Notícias");
    });

    it("salva a imagem no filesystem", async () => {
      const form = new FormData();
      form.append("title", "Com Imagem");
      form.append("image", makeImage({ name: "foto.png", type: "image/png" }));

      const { POST } = await importRoute();
      const res = await POST(
        new Request("http://localhost/api/news", { method: "POST", body: form })
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      createdIds.push(Number(body.news.id));
      createdFiles.push(body.news.image.replace("/news/", ""));

      await expect(
        access(join(NEWS_DIR, body.news.image.replace("/news/", "")))
      ).resolves.toBeUndefined();
    });

    it("faz trim no título", async () => {
      const form = new FormData();
      form.append("title", "  Com Espaços  ");
      form.append("image", makeImage());

      const { POST } = await importRoute();
      const res = await POST(
        new Request("http://localhost/api/news", { method: "POST", body: form })
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.news.title).toBe("Com Espaços");

      createdIds.push(Number(body.news.id));
      createdFiles.push(body.news.image.replace("/news/", ""));
    });
  });

  describe("DELETE", () => {
    it("retorna 400 sem id", async () => {
      const { DELETE } = await importRoute();
      const res = await DELETE(new Request("http://localhost/api/news"));

      expect(res.status).toBe(400);
    });

    it("retorna 400 com id inválido", async () => {
      const { DELETE } = await importRoute();
      const res = await DELETE(new Request("http://localhost/api/news?id=abc"));

      expect(res.status).toBe(400);
    });

    it("faz soft delete e retorna success", async () => {
      const repo = await importNewsRepo();
      const result = await repo.create({
        title: "Para Deletar",
        image: makeImage({ name: "to-delete.jpg" }),
      });
      createdIds.push(Number(result.news.id));
      createdFiles.push(result.news.image.replace("/news/", ""));

      const { DELETE } = await importRoute();
      const res = await DELETE(
        new Request(`http://localhost/api/news?id=${result.news.id}`)
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ success: true });

      const list = await repo.listActive();
      const found = list.find((n) => n.id === result.news.id);
      expect(found).toBeUndefined();
    });

    it("remove a imagem do filesystem ao deletar", async () => {
      const repo = await importNewsRepo();
      const result = await repo.create({
        title: "Com Imagem",
        image: makeImage({ name: "to-delete-img.jpg" }),
      });
      createdIds.push(Number(result.news.id));
      const fileName = result.news.image.replace("/news/", "");

      const { DELETE } = await importRoute();
      const res = await DELETE(
        new Request(`http://localhost/api/news?id=${result.news.id}`)
      );

      expect(res.status).toBe(200);

      await expect(access(join(NEWS_DIR, fileName))).rejects.toThrow();
    });

    it("retorna 404 quando notícia não existe", async () => {
      const { DELETE } = await importRoute();
      const res = await DELETE(new Request("http://localhost/api/news?id=999999"));

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toMatch(/não encontrada/i);
    });
  });

  describe("fluxo completo", () => {
    it("cria, lista e deleta notícia", async () => {
      // 1. Criar
      const form = new FormData();
      form.append("title", "Fluxo Completo");
      form.append("image", makeImage({ name: "fluxo.jpg", type: "image/jpeg" }));

      const { POST } = await importRoute();
      const postRes = await POST(
        new Request("http://localhost/api/news", { method: "POST", body: form })
      );
      expect(postRes.status).toBe(200);
      const postData = await postRes.json();
      const newsId = postData.news.id;
      createdIds.push(Number(newsId));
      createdFiles.push(postData.news.image.replace("/news/", ""));

      // 2. Listar e verificar que aparece
      const { GET } = await importRoute();
      const getRes = await GET();
      const getData = await getRes.json();
      const found = getData.news.find((n) => n.id === newsId);
      expect(found).toBeDefined();
      expect(found.title).toBe("Fluxo Completo");

      // 3. Deletar
      const { DELETE } = await importRoute();
      const delRes = await DELETE(
        new Request(`http://localhost/api/news?id=${newsId}`)
      );
      expect(delRes.status).toBe(200);

      // 4. Verificar que não aparece mais na listagem
      const getRes2 = await GET();
      const getData2 = await getRes2.json();
      const notFound = getData2.news.find((n) => n.id === newsId);
      expect(notFound).toBeUndefined();

      // 5. Verificar inatividade via repositório
      const repo = await importNewsRepo();
      const list = await repo.listActive();
      const stillActive = list.find((n) => n.id === newsId);
      expect(stillActive).toBeUndefined();
    });
  });
});
