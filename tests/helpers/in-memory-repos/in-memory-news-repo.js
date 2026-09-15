import crypto from "node:crypto";

/**
 * Allowed image MIME types.
 */
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/**
 * In-memory implementation of NewsRepository for fast contract testing.
 */
export class InMemoryNewsRepository {
  #news = new Map(); // id → { id, title, image_url, active, created_at }

  /**
   * Seed a news item into the in-memory store.
   * @param {object} data
   * @returns {{ id: number, title: string }}
   */
  seedNews(data) {
    const id = this.#nextId();
    const item = {
      id,
      title: data.title || `News ${Date.now()}`,
      image_url: data.image || `https://fake.storage/news/${id}.jpg`,
      active: true,
      created_at: new Date(),
    };
    this.#news.set(id, item);
    return { id, title: item.title };
  }

  async create({ title, image }) {
    if (!title || typeof title !== "string" || !title.trim()) {
      const err = new Error("Informe um título.");
      err.status = 400;
      throw err;
    }

    if (!image || typeof image === "string") {
      const err = new Error("Envie um arquivo de imagem.");
      err.status = 400;
      throw err;
    }

    if (!ALLOWED_TYPES.has(image.type)) {
      const err = new Error("Formato inválido. Use JPG, PNG, WEBP ou GIF.");
      err.status = 400;
      throw err;
    }

    const id = this.#nextId();
    const ext = (image.name?.split(".").pop() || "jpg").toLowerCase();
    const imageUrl = `https://fake.storage/news/${id}.${ext}`;

    const item = {
      id,
      title: title.trim(),
      image_url: imageUrl,
      active: true,
      created_at: new Date(),
    };
    this.#news.set(id, item);

    return {
      success: true,
      news: {
        id: String(id),
        title: item.title,
        image: imageUrl,
      },
    };
  }

  async remove(id) {
    if (!Number.isInteger(id) || id < 1) {
      const err = new Error("ID inválido.");
      err.status = 400;
      throw err;
    }

    const item = this.#news.get(id);
    if (!item) {
      const err = new Error("Notícia não encontrada.");
      err.status = 404;
      throw err;
    }

    item.active = false;
    return { success: true };
  }

  async listActive() {
    return Array.from(this.#news.values())
      .filter((n) => n.active)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((n) => ({
        id: String(n.id),
        title: n.title,
        image: n.image_url,
      }));
  }

  // --- Private helpers ---

  #nextId() {
    let max = 0;
    for (const id of this.#news.keys()) {
      if (id > max) max = id;
    }
    return max + 1;
  }
}
