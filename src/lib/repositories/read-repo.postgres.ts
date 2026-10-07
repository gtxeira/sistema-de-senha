import { prisma } from "@/lib/prisma-client";
import type { Prisma } from "@/generated/prisma/client";
import { MIN_DAYS, MAX_DAYS, DEFAULT_DAYS, LOCALE, CALL_TYPES } from "@/lib/constants";
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
 * Format date for display (HH:mm)
 */
function formatTime(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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
    time: formatTime(new Date(call.created_at || Date.now())),
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
      const since = options.since
        ? new Date(options.since)
        : new Date(Date.now() - (options.days || DEFAULT_DAYS) * 24 * 60 * 60 * 1000);
      const until = options.until ? new Date(options.until) : null;
      const limit = options.limit || 200;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Build where clause for all calls
      const createdAt: Prisma.DateTimeFilter = { gte: since.toISOString() };
      if (until) createdAt.lte = until.toISOString();

      const whereClause: Prisma.queue_callsWhereInput = { created_at: createdAt };
      if (sector) {
        whereClause.sector_id = sector;
      }

      // Build where clause for recent calls
      const recentWhereClause = { ...whereClause };

      // Execute both queries in parallel
      const [calls, recent] = await Promise.all([
        prisma.queue_calls.findMany({
          where: whereClause,
          select: {
            sector_id: true,
            type: true,
            created_at: true,
            number_int: true,
          },
        }),
        prisma.queue_calls.findMany({
          where: recentWhereClause,
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

      // Calculate totals
      const total = calls.length;
      // Comparação entre `Date` e a string ISO sempre deu `false` (ToNumber da
      // string resulta em NaN), então `summary.today` ficava preso em 0. A
      // implementação em memória já comparava os dois `Date`s — aqui passamos
      // a fazer o mesmo.
      const todayCount = calls.filter((c) => c.created_at >= today).length;
      const prefCount = calls.filter((c) =>
        ["preferencial", "preferential"].includes(c.type),
      ).length;
      const normalCount = total - prefCount;

      // Group by sector
      const sectorMap: Record<string, number> = {};
      for (const c of calls) {
        sectorMap[c.sector_id] = (sectorMap[c.sector_id] || 0) + 1;
      }
      const bySector = Object.entries(sectorMap)
        .map(([sector, count]) => ({ sector, total: count }))
        .sort((a, b) => b.total - a.total);

      // Group by type
      const typeMap: Record<string, number> = {};
      for (const c of calls) {
        typeMap[c.type] = (typeMap[c.type] || 0) + 1;
      }
      const byType = Object.entries(typeMap)
        .map(([type, count]) => ({ type, total: count }))
        .sort((a, b) => b.total - a.total);

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
        days: Math.min(
          MAX_DAYS,
          Math.max(
            MIN_DAYS,
            Math.ceil((Date.now() - since.getTime()) / (24 * 60 * 60 * 1000)),
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
