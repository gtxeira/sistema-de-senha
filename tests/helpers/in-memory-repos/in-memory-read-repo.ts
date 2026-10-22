import { normalizeCallType } from "@/lib/repositories/utils";
import { MIN_DAYS, MAX_DAYS } from "@/lib/constants";
import { dayWindow, startOfDay } from "@/lib/time";
import type {
  HistoryCall,
  QueueStats,
  ReadRepository,
  StatsOptions,
} from "@/lib/repositories/types";
import type { SeedCall } from "../../contracts/read-repo.contract";

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
      type: c.type === "preferential" ? "preferencial" : c.type,
      number_int: c.number,
      number_str: `${c.type === "preferencial" ? "P" : "N"}${String(c.number).padStart(3, "0")}`,
      created_at: c.created_at || new Date(),
    }));
  }

  async getStats(options: StatsOptions = {}): Promise<QueueStats> {
    // Rebuild to pick up any new calls added to the raw array
    this.#rebuild();

    const {
      sector = null,
      limit = 200,
      days = 30,
      now = new Date(),
    } = options;

    // Mesma janela do Postgres: dias-calendário BRT (a meia-noite BRT
    // de `days - 1` dias atrás até a meia-noite BRT do dia seguinte).
    const window = dayWindow(days, now);
    const sinceDate = options.since ?? window.since;
    const untilDate =
      options.until !== undefined ? options.until : window.until;

    // "Hoje" = desde a meia-noite BRT de hoje.
    const todayStart = startOfDay(now);

    // Filter calls
    const filtered = this.#calls.filter((c) => {
      const d = new Date(c.created_at);
      if (d < sinceDate) return false;
      if (untilDate && d >= untilDate) return false;
      if (sector && c.sector_id !== sector) return false;
      return true;
    });

    // Summary
    const preferencial = filtered.filter((c) => c.type === "preferencial").length;
    const normal = filtered.filter((c) => c.type === "normal").length;
    const total = filtered.length;
    const todayCount = filtered.filter((c) => {
      const d = new Date(c.created_at);
      return d >= todayStart;
    }).length;

    // By sector
    const sectorMap = new Map<string, number>();
    for (const c of filtered) {
      sectorMap.set(c.sector_id, (sectorMap.get(c.sector_id) || 0) + 1);
    }
    // Mesmo critério do Postgres: total decrescente, desempate pelo nome.
    const bySector = Array.from(sectorMap.entries())
      .map(([sector, total]) => ({ sector, total }))
      .sort((a, b) => b.total - a.total || a.sector.localeCompare(b.sector));

    // By type
    const typeMap = new Map<string, number>();
    for (const c of filtered) {
      typeMap.set(c.type, (typeMap.get(c.type) || 0) + 1);
    }
    const byType = Array.from(typeMap.entries())
      .map(([type, total]) => ({ type, total }))
      .sort((a, b) => b.total - a.total || a.type.localeCompare(b.type));

    // Recent (most recent first)
    const recent: HistoryCall[] = [...filtered]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit)
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

    // Recent by sector — alinhado ao Postgres: o item de `recent` já carrega
    // `sector_id`, então não é preciso procurar de volta em `filtered`.
    const recentBySector: Record<string, HistoryCall[]> = {};
    for (const c of recent) {
      const s = c.sector_id || "unknown";
      if (!recentBySector[s]) recentBySector[s] = [];
      recentBySector[s].push(c);
    }

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
      bySector,
      byType,
      recent,
      recentBySector,
    };
  }
}
