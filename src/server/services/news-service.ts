import 'server-only';

import type { CreateNewsInput } from '@/server/repositories/types';
import type { NewsItem } from '@/shared/types/domain';

import { news } from '@/server/repositories';

/**
 * Use cases de notícias.
 *
 * O upload/rollback e as validações de arquivo continuam no repositório; o
 * serviço é o ponto de entrada do backend caso outras superfícies (ex.: um
 * job administrativo) precisem listar/criar/remover notícias sem passar por
 * HTTP.
 */

export function createNews(
  data: CreateNewsInput,
): Promise<{ news: NewsItem; success: true; }> {
  return news.create(data);
}

export function listNews(): Promise<NewsItem[]> {
  return news.listActive();
}

export function removeNews(id: number | string): Promise<{ success: true }> {
  return news.remove(id);
}
