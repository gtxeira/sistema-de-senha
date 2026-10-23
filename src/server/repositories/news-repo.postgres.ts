import 'server-only';

import type { CreateNewsInput, NewsItem, NewsRepository } from './types';

import { prisma } from '@/server/db/prisma-client';
import { routeError, RouteError } from '@/server/http/errors';
import {
  deleteFromS3,
  extractKeyFromUrl,
  getPublicUrl,
  uploadToS3,
} from '@/server/storage/s3-client';
import { NEWS_MAX_ACTIVE } from '@/shared/constants';
import { errorMessage } from '@/shared/errors';
import { isAllowedImageType, isValidFileSize } from '@/shared/validation';

export class PostgresNewsRepository implements NewsRepository {
  /** Create a news item (upload image to S3 + save to db) */
  async create({
    title,
    image,
  }: CreateNewsInput): Promise<{ news: NewsItem; success: true; }> {
    if (!title || typeof title !== 'string' || !(title = title.trim())) {
      throw routeError(400, 'Informe um título.');
    }
    if (!image || typeof image === 'string') {
      throw routeError(400, 'Envie um arquivo de imagem.');
    }
    if (!isAllowedImageType(image.type)) {
      throw routeError(400, 'Formato inválido. Use JPG, PNG, WEBP ou GIF.');
    }
    if (!isValidFileSize(image.size)) {
      throw routeError(400, 'Imagem deve ter no máximo 5 MB.');
    }

    const ext = (image.name.split('.').pop() || 'jpg').toLowerCase();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const buffer = Buffer.from(await image.arrayBuffer());

    try {
      await uploadToS3(fileName, buffer, image.type);
    } catch (error) {
      throw routeError(
        500,
        errorMessage(error, 'Erro ao fazer upload da imagem.'),
      );
    }

    const imageUrl = getPublicUrl(fileName);

    try {
      const row = await prisma.news.create({
        data: { title, image_url: imageUrl },
        select: { id: true, title: true, image_url: true },
      });

      return {
        news: {
          id: String(row.id),
          title: row.title,
          image: row.image_url,
        },
        success: true,
      };
    } catch (error) {
      // Rollback: delete from S3 if DB write fails
      await deleteFromS3(fileName);
      if (error instanceof RouteError) throw error;
      throw routeError(500, errorMessage(error, 'Erro ao salvar notícia.'));
    }
  }

  /** List active news (limited to 10, most recent first) */
  async listActive(): Promise<NewsItem[]> {
    try {
      const rows = await prisma.news.findMany({
        orderBy: { created_at: 'desc' },
        select: { id: true, title: true, image_url: true },
        take: NEWS_MAX_ACTIVE,
        where: { active: true },
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

  /** Delete a news item (soft delete + remove image from S3) */
  async remove(id: number | string): Promise<{ success: true }> {
    if (!Number.isInteger(Number(id)) || Number(id) < 1) {
      throw routeError(400, 'ID inválido.');
    }

    try {
      const row = await prisma.news.findUnique({
        select: { image_url: true },
        where: { id: BigInt(id) },
      });

      if (!row) {
        throw routeError(404, 'Notícia não encontrada.');
      }

      await prisma.news.update({
        data: { active: false },
        where: { id: BigInt(id) },
      });

      // Best effort: remove image from S3
      const key = extractKeyFromUrl(row.image_url);
      if (key) await deleteFromS3(key);

      return { success: true };
    } catch (error) {
      if (error instanceof RouteError) throw error;
      throw routeError(500, errorMessage(error, 'Erro ao excluir.'));
    }
  }
}
