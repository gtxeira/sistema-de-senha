import 'server-only';

import type { SequenceType } from '@/shared/constants';
import type { QueueStats } from '@/shared/types/domain';

import { read } from '@/server/repositories';
import {
  CALL_TYPES,
  DEFAULT_DAYS,
  MAX_DAYS,
  MIN_DAYS,
} from '@/shared/constants';
import { sanitizeNull } from '@/shared/sanitization';
import { normalizePage, normalizePageSize } from '@/shared/validation';

/**
 * Use cases de estatísticas/histórico.
 *
 * A query string é normalizada aqui (dias, setor, tipo e paginação) e a
 * leitura devolve a estrutura vazia com `noDb: true` quando o banco falha.
 * A rota só resolve autenticação/escopo e serializa o resultado.
 */

export interface StatsQuery {
  readonly days: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sector: null | string;
  readonly type: SequenceType | null;
}

/** Busca as estatísticas; nunca lança — em erro devolve a estrutura vazia. */
export async function getStats(query: StatsQuery): Promise<QueueStats> {
  try {
    return await read.getStats(query);
  } catch {
    // On error, return empty structure to avoid breaking admin UI
    return {
      calls: [],
      days: query.days,
      noDb: true,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: 0,
        totalPages: 1,
      },
      summary: { normal: 0, preferencial: 0, today: 0, total: 0 },
    };
  }
}

/** Lê e normaliza os parâmetros de `/api/stats`. */
export function parseStatsQuery(searchParams: URLSearchParams): StatsQuery {
  const days = Math.min(
    MAX_DAYS,
    Math.max(MIN_DAYS, Number(searchParams.get('days')) || DEFAULT_DAYS),
  );
  const sector = sanitizeNull(searchParams.get('sector')) || null;

  // Tipo inválido é IGNORADO (não vira 400): o filtro é opcional e a
  // tabela simplesmente mostra todos. `preferential` é a grafia antiga
  // da API e continua aceita.
  const typeParam = sanitizeNull(searchParams.get('type'));
  const type =
    typeParam === CALL_TYPES.PREFERENCIAL ||
    typeParam === CALL_TYPES.PREFERENTIAL
      ? CALL_TYPES.PREFERENCIAL
      : (typeParam === CALL_TYPES.NORMAL
        ? CALL_TYPES.NORMAL
        : null);

  const page = normalizePage(Number(searchParams.get('page')));
  const pageSize = normalizePageSize(Number(searchParams.get('pageSize')));

  return { days, page, pageSize, sector, type };
}
