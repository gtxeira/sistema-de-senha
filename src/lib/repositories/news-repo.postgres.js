import { PrismaClient } from "@prisma/client";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";

const prisma = new PrismaClient();

const NEWS_DIR = process.env.NEWS_DIR || join(process.cwd(), "public", "news");

/**
 * Create typed error with status
 * @param {number} status
 * @param {string} message
 * @returns {Error & { status: number }}
 */
function routeError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Validate allowed image types
 * @param {string} type
 * @returns {boolean}
 */
function isAllowedImageType(type) {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
  return allowedTypes.includes(type);
}

/**
 * Validate file size (max 5MB)
 * @param {number} size
 * @returns {boolean}
 */
function isValidFileSize(size) {
  return size <= 5 * 1024 * 1024;
}

/**
 * Ensure the news image directory exists
 */
async function ensureNewsDir() {
  await mkdir(NEWS_DIR, { recursive: true });
}

export class NewsRepository {
  /**
   * Create a news item (upload image to filesystem + save to db)
   * @param {{ title: string, image: File }} data
   * @returns {Promise<{
   *   success: boolean,
   *   news: { id: string, title: string, image: string }
   * }>}
   */
  async create({ title, image }) {
    if (!title || typeof title !== "string" || !(title = title.trim())) {
      throw routeError(400, "Informe um título.");
    }
    if (!image || typeof image === "string") {
      throw routeError(400, "Envie um arquivo de imagem.");
    }
    if (!isAllowedImageType(image.type)) {
      throw routeError(400, "Formato inválido. Use JPG, PNG, WEBP ou GIF.");
    }
    if (!isValidFileSize(image.size)) {
      throw routeError(400, "Imagem deve ter no máximo 5 MB.");
    }

    try {
      await ensureNewsDir();

      const ext = (image.name.split(".").pop() || "jpg").toLowerCase();
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const buffer = Buffer.from(await image.arrayBuffer());

      await writeFile(join(NEWS_DIR, fileName), buffer);

      const imageUrl = `/news/${fileName}`;

      const row = await prisma.news.create({
        data: { title, image_url: imageUrl },
        select: { id: true, title: true, image_url: true },
      });

      return {
        success: true,
        news: {
          id: String(row.id),
          title: row.title,
          image: row.image_url,
        },
      };
    } catch (err) {
      if (err.status) throw err;
      throw routeError(500, err.message || "Erro ao salvar notícia.");
    }
  }

  /**
   * Delete a news item (soft delete + remove image from filesystem)
   * @param {string|number} id
   * @returns {Promise<{ success: boolean }>}
   */
  async remove(id) {
    if (!Number.isInteger(Number(id)) || Number(id) < 1) {
      throw routeError(400, "ID inválido.");
    }

    try {
      const row = await prisma.news.findUnique({
        where: { id: BigInt(id) },
        select: { image_url: true },
      });

      if (!row) {
        throw routeError(404, "Notícia não encontrada.");
      }

      await prisma.news.update({
        where: { id: BigInt(id) },
        data: { active: false },
      });

      // Best effort: remove image from filesystem
      if (row.image_url && row.image_url.startsWith("/news/")) {
        const filePath = join(NEWS_DIR, row.image_url.replace("/news/", ""));
        await unlink(filePath).catch(() => {});
      }

      return { success: true };
    } catch (err) {
      if (err.status) throw err;
      throw routeError(err.status || 500, err.message || "Erro ao excluir.");
    }
  }

  /**
   * List active news (limited to 10, most recent first)
   * @returns {Promise<Array<{ id: string, title: string, image: string }>>}
   */
  async listActive() {
    try {
      const rows = await prisma.news.findMany({
        where: { active: true },
        select: { id: true, title: true, image_url: true },
        orderBy: { created_at: "desc" },
        take: 10,
      });

      return rows.map((row) => ({
        id: String(row.id),
        title: row.title,
        image: row.image_url,
      }));
    } catch {
      return [];
    }
  }
}
