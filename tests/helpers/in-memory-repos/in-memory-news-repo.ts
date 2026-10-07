import type {
  CreateNewsInput,
  NewsItem,
  NewsRepository,
} from "@/lib/repositories/types";
import { RouteError } from "@/lib/repositories/utils";
import type { NewsSeedInput } from "../../contracts/news-repo.contract";

/**
 * Allowed image MIME types.
 */
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/** Notícia gravada no Map — `NewsItem` é o formato devolvido na leitura. */
interface StoredNews {
  id: number;
  title: string;
  image_url: string;
  active: boolean;
  created_at: Date;
}

/**
 * In-memory implementation of NewsRepository for fast contract testing.
 */
export class InMemoryNewsRepository implements NewsRepository {
  #news = new Map<number, StoredNews>();

  /**
   * Seed a news item into the in-memory store.
   * @returns `{ id, title }` para o teste reutilizar a linha criada.
   */
  seedNews(data: NewsSeedInput): { id: number; title: string } {
    const id = this.#nextId();
    const item: StoredNews = {
      id,
      title: data.title || `News ${Date.now()}`,
      image_url: data.image || `https://fake.storage/news/${id}.jpg`,
      active: true,
      created_at: new Date(),
    };
    this.#news.set(id, item);
    return { id, title: item.title };
  }

  async create(data: CreateNewsInput): Promise<{ success: true; news: NewsItem }> {
    const { title, image } = data;

    if (!title || typeof title !== "string" || !title.trim()) {
      throw new RouteError(400, "Informe um título.");
    }

    if (!image || typeof image === "string") {
      throw new RouteError(400, "Envie um arquivo de imagem.");
    }

    // A partir daqui `image` é `File` (o tipo estreita depois das checagens).
    if (!ALLOWED_TYPES.has(image.type)) {
      throw new RouteError(400, "Formato inválido. Use JPG, PNG, WEBP ou GIF.");
    }

    const id = this.#nextId();
    const ext = (image.name.split(".").pop() || "jpg").toLowerCase();
    const imageUrl = `https://fake.storage/news/${id}.${ext}`;

    const item: StoredNews = {
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

  async remove(id: string | number): Promise<{ success: true }> {
    // `Number.isInteger` não estreita `string | number`, e o original rejeita
    // string numérica — checar o tipo antes preserva exatamente esse comportamento.
    if (typeof id !== "number" || !Number.isInteger(id) || id < 1) {
      throw new RouteError(400, "ID inválido.");
    }

    const item = this.#news.get(id);
    if (!item) {
      throw new RouteError(404, "Notícia não encontrada.");
    }

    item.active = false;
    return { success: true };
  }

  async listActive(): Promise<NewsItem[]> {
    return Array.from(this.#news.values())
      .filter((n) => n.active)
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
      .map((n) => ({
        id: String(n.id),
        title: n.title,
        image: n.image_url,
      }));
  }

  // --- Private helpers ---

  #nextId(): number {
    let max = 0;
    for (const id of this.#news.keys()) {
      if (id > max) max = id;
    }
    return max + 1;
  }
}
