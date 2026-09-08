import { describe, it, expect } from "vitest";

/**
 * Create a mock File-like object for news create().
 * @param {object} opts
 * @returns {File-like}
 */
function makeImage({ name = "test.jpg", type = "image/jpeg", size = 1024 } = {}) {
  const data = new Uint8Array(size);
  return {
    name,
    type,
    size,
    arrayBuffer: async () => data.buffer,
  };
}

/**
 * NewsRepository contract — shared test suite.
 * Pass a factory that returns { repo, seedNews }.
 * seedNews inserts a test news item and returns { id, title }.
 */
export function newsRepoContract(createRepo) {
  describe("NewsRepository contract", () => {
    let repo;
    let seedNews;

    beforeEach(async () => {
      const ctx = await createRepo();
      repo = ctx.repo;
      seedNews = ctx.seedNews;
    });

    describe("create()", () => {
      it("insere e retorna notícia com success: true", async () => {
        const result = await repo.create({
          title: "Notícia Teste",
          image: makeImage({ name: "foto.jpg", type: "image/jpeg", size: 2048 }),
        });

        expect(result.success).toBe(true);
        expect(result.news).toHaveProperty("id");
        expect(result.news.title).toBe("Notícia Teste");
        expect(result.news).toHaveProperty("image");
      });

      it("lança erro para título vazio", async () => {
        await expect(
          repo.create({
            title: "",
            image: makeImage(),
          }),
        ).rejects.toMatchObject({ status: 400 });
      });

      it("lança erro para imagem inválida (não arquivo)", async () => {
        await expect(
          repo.create({
            title: "Teste",
            image: "nao-e-arquivo",
          }),
        ).rejects.toMatchObject({ status: 400 });
      });

      it("lança erro para formato não permitido", async () => {
        await expect(
          repo.create({
            title: "Teste",
            image: makeImage({ type: "application/pdf" }),
          }),
        ).rejects.toMatchObject({ status: 400 });
      });
    });

    describe("remove()", () => {
      it("marca notícia como inativa sem erro", async () => {
        const { id } = await seedNews({ title: "Para remover" });
        const result = await repo.remove(id);
        expect(result).toEqual({ success: true });
      });

      it("lança erro para ID inválido", async () => {
        await expect(repo.remove(-1)).rejects.toMatchObject({ status: 400 });
        await expect(repo.remove(0)).rejects.toMatchObject({ status: 400 });
      });
    });

    describe("listActive()", () => {
      it("retorna array de notícias ativas", async () => {
        await seedNews({ title: "Ativa 1" });
        await seedNews({ title: "Ativa 2" });
        const list = await repo.listActive();
        expect(Array.isArray(list)).toBe(true);
      });

      it("cada item tem campos obrigatórios", async () => {
        await seedNews({ title: "Campo Obrigatório" });
        const list = await repo.listActive();
        if (list.length > 0) {
          const item = list[0];
          expect(item).toHaveProperty("id");
          expect(item).toHaveProperty("title");
          expect(item).toHaveProperty("image");
        }
      });

      it("não inclui notícias removidas (inativas)", async () => {
        const { id } = await seedNews({ title: "Será Removida" });
        await repo.remove(id);
        const list = await repo.listActive();
        const found = list.find((n) => n.id === String(id));
        expect(found).toBeUndefined();
      });
    });
  });
}
