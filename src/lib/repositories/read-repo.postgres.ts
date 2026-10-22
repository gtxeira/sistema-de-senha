import { prisma } from "@/lib/prisma-client";
import type { Prisma } from "@/generated/prisma/client";
import {
  MIN_DAYS,
  MAX_DAYS,
  DEFAULT_DAYS,
  CALL_TYPES,
  PAGE_SIZES,
} from "@/lib/constants";
import { dayWindow, startOfDay } from "@/lib/time";
import { normalizePage, normalizePageSize } from "./utils";
import type { HistoryCall, QueueStats, ReadRepository, StatsOptions } from "./types";

/** Linha como o `findMany` de `getRecentCalls` devolve. */
type RecentRow = Prisma.queue_callsGetPayload<{
  select: {
    id: true;
    sector_id: true;
    number_str: true;
    type: true;
    created_at: true;
    number_int: true;
  };
}>;

/**
 * Build empty response structure
 */
function emptyResponse(
  days: number,
  page = 1,
  pageSize = PAGE_SIZES.historico,
): QueueStats {
  return {
    days,
    summary: { total: 0, today: 0, preferencial: 0, normal: 0 },
    calls: [],
    pagination: { page, pageSize, total: 0, totalPages: 1 },
    noDb: true,
  };
}

/**
 * Normalize a queue call record for frontend consumption
 */
function formatCallRecord(call: RecentRow): HistoryCall {
  return {
    id: String(call.id),
    sector_id: call.sector_id,
    number: call.number_int,
    // O enum do banco só admite 'normal'|'preferencial'; a grafia
    // 'preferential' existe só na API e nunca chega a esta coluna.
    type: call.type === CALL_TYPES.PREFERENCIAL
      ? CALL_TYPES.PREFERENCIAL
      : CALL_TYPES.NORMAL,
    // O INSTANTE, não "HH:mm": um horário sem data não diz de que dia
    // a chamada foi — e é o dia que decide se ela entra em "Hoje".
    createdAt: new Date(call.created_at || Date.now()).toISOString(),
  };
}

export class PostgresReadRepository implements ReadRepository {
  /**
   * Get stats for a time window with filters.
   * Nunca lança: em erro devolve a estrutura vazia com `noDb: true`.
   */
  async getStats(options: StatsOptions = {}): Promise<QueueStats> {
    try {
      // Parse options
      const sector = options.sector || null;
      const type = options.type ?? null;
      const now = options.now ?? new Date();
      const days = options.days || DEFAULT_DAYS;
      const pageSize = normalizePageSize(options.pageSize);
      // Página pedida; o clamp final depende do total, que só é conhecido
      // depois das contagens.
      const requestedPage = normalizePage(options.page);

      // Janela em dias-calendário BRT: "Hoje" = da meia-noite BRT de
      // hoje até a de amanhã. A janela antiga ("agora menos N×24h")
      // não era o dia de hoje — e mudava de significado conforme a
      // hora do dia em que a página era aberta.
      const window = dayWindow(days, now);
      const since = options.since ?? window.since;
      // `until: null` (explícito) continua significando "sem limite
      // superior"; ausente, vale o fim da janela.
      const until = options.until !== undefined ? options.until : window.until;

      // "Hoje" = desde a meia-noite BRT de hoje. O `setHours(0,0,0,0)`
      // antigo cortava na meia-noite do SERVIDOR (UTC no Docker), e o
      // contador virava de dia às 21:00 do horário brasileiro.
      const todayStart = startOfDay(now);

      // O banco guarda INSTANTES (TIMESTAMPTZ): o filtro é comparação de
      // instantes — `lt` no `until`, que é exclusivo.
      const createdAt: Prisma.DateTimeFilter = { gte: since.toISOString() };
      if (until) createdAt.lt = until.toISOString();

      // Duas `where`: `windowWhere` descreve a janela (usada pelos CARDS) e
      // `pageWhere` acrescenta o filtro de tipo (usada pela TABELA). O
      // resumo ignora o filtro de tipo de propósito — "Total no período" e
      // "Atendimentos hoje" não mudam ao filtrar a tabela por preferencial.
      const windowWhere: Prisma.queue_callsWhereInput = { created_at: createdAt };
      if (sector) {
        windowWhere.sector_id = sector;
      }

      const pageWhere: Prisma.queue_callsWhereInput = type
        ? { ...windowWhere, type }
        : windowWhere;

      // "Hoje" recortado DENTRO da janela: o piso é o maior dos dois. Se a
      // janela começa depois da meia-noite (um `since` explícito no futuro,
      // por exemplo), `today` não pode contar chamadas fora dela.
      const todayFrom = todayStart.getTime() > since.getTime() ? todayStart : since;
      const todayWhereClause: Prisma.queue_callsWhereInput = {
        ...windowWhere,
        created_at: until
          ? { gte: todayFrom.toISOString(), lt: until.toISOString() }
          : { gte: todayFrom.toISOString() },
      };

      // A agregação acontece no BANCO.
      //
      // Antes, a janela inteira (até 90 dias de chamadas) era trazida para
      // a memória só para ser contada e agrupada em JS — custo que crescia
      // com o histórico e não com o que a tela mostra. Agora `count` e
      // `groupBy` fazem a mesma conta no servidor e devolvem só números:
      // as linhas não atravessam a rede.
      //
      // Os índices de `queue_calls` (ver `prisma/schema.prisma`) cobrem
      // justamente estas consultas: janela global por `created_at`, janela
      // por setor e a ordenação da paginação.
      const [total, todayCount, typeGroups] = await Promise.all([
        prisma.queue_calls.count({ where: windowWhere }),
        prisma.queue_calls.count({ where: todayWhereClause }),
        prisma.queue_calls.groupBy({
          by: ["type"],
          where: windowWhere,
          _count: true,
        }),
      ]);

      // O enum do banco só admite 'normal'|'preferencial' — então o total
      // de preferenciais vem do próprio agrupamento, sem uma query extra.
      const prefCount =
        typeGroups.find((entry) => entry.type === CALL_TYPES.PREFERENCIAL)?._count ?? 0;
      const normalCount = total - prefCount;

      // `pagination.total` é o total FILTRADO (janela + setor + tipo). Com
      // tipo informado ele sai do agrupamento acima; sem tipo, é o próprio
      // `total` da janela — nenhuma contagem extra.
      const filteredTotal = type
        ? type === CALL_TYPES.PREFERENCIAL
          ? prefCount
          : normalCount
        : total;

      const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));
      const page = Math.min(requestedPage, totalPages);

      // Só a página vai para a memória — nunca a janela inteira.
      //
      // `id` é o desempate: `createMany` compartilha o `now()` da transação,
      // então várias linhas podem ter o MESMO `created_at`; sem uma chave
      // única a paginação repetiria ou pularia registros.
      const calls = await prisma.queue_calls.findMany({
        where: pageWhere,
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          sector_id: true,
          number_str: true,
          type: true,
          created_at: true,
          number_int: true,
        },
      });

      return {
        // A extensão real da janela (e não o `days` pedido): com a
        // janela BRT ela é exatamente `days` dias-calendário.
        days: Math.min(
          MAX_DAYS,
          Math.max(
            MIN_DAYS,
            until
              ? Math.ceil((until.getTime() - since.getTime()) / (24 * 60 * 60 * 1000))
              : days,
          ),
        ),
        summary: {
          total,
          today: todayCount,
          preferencial: prefCount,
          normal: normalCount,
        },
        calls: calls.map(formatCallRecord),
        pagination: {
          page,
          pageSize,
          total: filteredTotal,
          totalPages,
        },
      };
    } catch {
      // On error, return empty structure instead of throwing
      const days = Math.min(MAX_DAYS, Math.max(MIN_DAYS, Number(options.days) || DEFAULT_DAYS));
      const page = normalizePage(options.page);
      return emptyResponse(days, page, normalizePageSize(options.pageSize));
    }
  }
}
