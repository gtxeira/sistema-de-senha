import { prisma } from "@/lib/prisma-client";
import type { Prisma } from "@/generated/prisma/client";
import { MIN_DAYS, MAX_DAYS, DEFAULT_DAYS, CALL_TYPES } from "@/lib/constants";
import { dayWindow, startOfDay } from "@/lib/time";
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
function emptyResponse(days: number): QueueStats {
  return {
    days,
    summary: { total: 0, today: 0, preferencial: 0, normal: 0 },
    bySector: [],
    byType: [],
    recent: [],
    recentBySector: {},
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
      const now = options.now ?? new Date();
      const days = options.days || DEFAULT_DAYS;
      const limit = options.limit || 200;

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

      const whereClause: Prisma.queue_callsWhereInput = { created_at: createdAt };
      if (sector) {
        whereClause.sector_id = sector;
      }

      // "Hoje" recortado DENTRO da janela: o piso é o maior dos dois. Se a
      // janela começa depois da meia-noite (um `since` explícito no futuro,
      // por exemplo), `today` não pode contar chamadas fora dela.
      const todayFrom = todayStart.getTime() > since.getTime() ? todayStart : since;
      const todayWhereClause: Prisma.queue_callsWhereInput = {
        ...whereClause,
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
      // as linhas não atravessam a rede. O `findMany` fica restrito ao
      // que é EXIBIDO (`take`).
      //
      // Nota: `queue_calls` não tem índice em `created_at`, então essas
      // agregações ainda varrem a tabela. Ver `prisma/schema.prisma` —
      // um índice em (sector_id, created_at) é o próximo passo natural.
      const [total, todayCount, sectorGroups, typeGroups, recent] =
        await Promise.all([
          prisma.queue_calls.count({ where: whereClause }),
          prisma.queue_calls.count({ where: todayWhereClause }),
          prisma.queue_calls.groupBy({
            by: ["sector_id"],
            where: whereClause,
            _count: true,
          }),
          prisma.queue_calls.groupBy({
            by: ["type"],
            where: whereClause,
            _count: true,
          }),
          prisma.queue_calls.findMany({
            where: whereClause,
            orderBy: { created_at: "desc" },
            take: limit,
            select: {
              id: true,
              sector_id: true,
              number_str: true,
              type: true,
              created_at: true,
              number_int: true,
            },
          }),
        ]);

      // Desempate pelo nome: o `groupBy` não garante ordem para contagens
      // iguais, e a saída precisa ser estável entre execuções (é o mesmo
      // critério da implementação em memória).
      const bySector = sectorGroups
        .map((group) => ({ sector: group.sector_id, total: group._count }))
        .sort((a, b) => b.total - a.total || a.sector.localeCompare(b.sector));

      const byType = typeGroups
        .map((group) => ({ type: group.type, total: group._count }))
        .sort((a, b) => b.total - a.total || a.type.localeCompare(b.type));

      // O enum do banco só admite 'normal'|'preferencial' — então o total
      // de preferenciais vem do próprio agrupamento, sem uma query extra.
      const prefCount =
        byType.find((entry) => entry.type === CALL_TYPES.PREFERENCIAL)?.total ?? 0;
      const normalCount = total - prefCount;

      // Format recent calls
      const formattedRecent = recent.map(formatCallRecord);

      // Group recent by sector (max 50 per sector)
      const recentBySector: Record<string, HistoryCall[]> = {};
      for (const item of formattedRecent) {
        const sid = item.sector_id || "desconhecido";
        if (!recentBySector[sid]) recentBySector[sid] = [];
        if (recentBySector[sid].length < 50) recentBySector[sid].push(item);
      }

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
        bySector,
        byType,
        recent: formattedRecent,
        recentBySector,
      };
    } catch {
      // On error, return empty structure instead of throwing
      const days = Math.min(MAX_DAYS, Math.max(MIN_DAYS, Number(options.days) || DEFAULT_DAYS));
      return emptyResponse(days);
    }
  }
}
