import 'server-only';

import { news } from '@/server/repositories';
import type { CreateNewsInput } from '@/server/repositories/types';
import type { NewsItem } from '@/shared/types/domain';

/**
 * Use cases de notícias.
 *
 * O upload/rollback e as validações de arquivo continuam no repositório; o
 * serviço é o ponto de entrada do backend caso outras superfícies (ex.: um
 * job administrativo) precisem listar/criar/remover notícias sem passar por
 * HTTP.
 */

export function listNews(): Promise<NewsItem[]> {
  return news.listActive();
}

export function createNews(
  data: CreateNewsInput,
): Promise<{ success: true; news: NewsItem }> {
  return news.create(data);
}

export function removeNews(id: string | number): Promise<{ success: true }> {
  return news.remove(id);
}
