import type {
  HistoryCall,
  QueueStats,
  ReadRepository,
  StatsOptions,
} from '@/server/repositories/types';
import type { SeedCall } from '../../contracts/read-repo.contract';

import { MAX_DAYS, MIN_DAYS } from '@/shared/constants';
import { normalizeCallType } from '@/shared/queue-format';
import { dayWindow, startOfDay } from '@/shared/time';
import { normalizePage, normalizePageSize } from '@/shared/validation';

/** Linha interna: o seed de contrato com o timestamp já preenchido. */
interface StoredCall {
  readonly id: string;
  readonly sector_id: string;
  readonly type: string;
  readonly number_int: number;
  readonly number_str: string;
  readonly created_at: Date | string;
}

/**
 * In-memory implementation of ReadRepository for fast contract testing.
 * Receives an array of call records to simulate existing data.
 */
export class InMemoryReadRepository implements ReadRepository {
  #calls: StoredCall[] = [];
  #rawCalls: readonly SeedCall[];

  constructor(calls: readonly SeedCall[] = []) {
    this.#rawCalls = calls;
    this.#rebuild();
  }

  /** Rebuild internal calls array from raw calls. */
  #rebuild(): void {
    this.#calls = this.#rawCalls.map((c, i) => ({
      id: String(i + 1),
      sector_id: c.sector,
      type: c.type === 'preferential' ? 'preferencial' : c.type,
      number_int: c.number,
      number_str: `${c.type === 'preferencial' ? 'P' : 'N'}${String(c.number).padStart(3, '0')}`,
      created_at: c.created_at || new Date(),
    }));
  }

  async getStats(options: StatsOptions = {}): Promise<QueueStats> {
    // Rebuild to pick up any new calls added to the raw array
    this.#rebuild();

    const { sector = null, type = null, days = 30, now = new Date() } = options;

    const pageSize = normalizePageSize(options.pageSize);
    const requestedPage = normalizePage(options.page);

    // Mesma janela do Postgres: dias-calendário BRT (a meia-noite BRT
    // de `days - 1` dias atrás até a meia-noite BRT do dia seguinte).
    const window = dayWindow(days, now);
    const sinceDate = options.since ?? window.since;
    const untilDate =
      options.until !== undefined ? options.until : window.until;

    // "Hoje" = desde a meia-noite BRT de hoje.
    const todayStart = startOfDay(now);

    // Janela + setor: a base dos CARDS (`summary`).
    const filtered = this.#calls.filter((c) => {
      const d = new Date(c.created_at);
      if (d < sinceDate) return false;
      if (untilDate && d >= untilDate) return false;
      if (sector && c.sector_id !== sector) return false;
      return true;
    });

    // Summary — ignora o filtro de tipo, igual ao Postgres.
    const preferencial = filtered.filter(
      (c) => c.type === 'preferencial',
    ).length;
    const total = filtered.length;
    const normal = total - preferencial;
    const todayCount = filtered.filter((c) => {
      const d = new Date(c.created_at);
      return d >= todayStart;
    }).length;

    // A TABELA acrescenta o filtro de tipo.
    const pageCalls = type ? filtered.filter((c) => c.type === type) : filtered;
    const filteredTotal = pageCalls.length;
    const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));
    const page = Math.min(requestedPage, totalPages);

    // Ordenação `created_at DESC` + `id DESC` — o mesmo desempate do
    // Postgres. Lá o `id` é uuid; aqui é a string sequencial, então a ordem
    // entre timestamps IGUAIS difere. O contrato não afirma ordem nesse
    // caso (ver `read-repo.contract.ts`).
    const calls: HistoryCall[] = [...pageCalls]
      .sort((a, b) => {
        const byTime =
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (byTime !== 0) return byTime;
        return a.id < b.id ? 1 : (a.id > b.id ? -1 : 0);
      })
      .slice((page - 1) * pageSize, page * pageSize)
      .map((c) => ({
        id: c.id,
        sector_id: c.sector_id,
        number: c.number_int,
        // `normalizeCallType` aceita as duas grafias e devolve `SequenceType`
        // — é o mesmo encurtamento de `formatCallRecord` no Postgres.
        type: normalizeCallType(c.type).sequenceType,
        // O INSTANTE, não "HH:mm": quem exibe formata em BRT.
        createdAt: new Date(c.created_at).toISOString(),
      }));

    // A extensão real da janela — igual ao Postgres (a janela BRT de N
    // dias mede exatamente N dias-calendário).
    const windowDays = untilDate
      ? Math.ceil(
          (untilDate.getTime() - sinceDate.getTime()) / (24 * 60 * 60 * 1000),
        )
      : days;

    return {
      days: Math.min(MAX_DAYS, Math.max(MIN_DAYS, windowDays)),
      summary: { total, today: todayCount, preferencial, normal },
      calls,
      pagination: { page, pageSize, total: filteredTotal, totalPages },
    };
  }
}
