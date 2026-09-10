/**
 * In-memory implementation of ReadRepository for fast contract testing.
 * Receives an array of call records to simulate existing data.
 */
export class InMemoryReadRepository {
  #calls;
  #rawCalls;

  /**
   * @param {Array<{sector:string, type:string, number:number, created_at?:Date|string}>} calls
   */
  constructor(calls = []) {
    this.#rawCalls = calls;
    this.#calls = [];
    this.#rebuild();
  }

  /** Rebuild internal calls array from raw calls. */
  #rebuild() {
    this.#calls = this.#rawCalls.map((c, i) => ({
      id: String(i + 1),
      sector_id: c.sector,
      type: c.type === "preferential" ? "preferencial" : c.type,
      number_int: c.number,
      number_str: `${c.type === "preferencial" ? "P" : "N"}${String(c.number).padStart(3, "0")}`,
      created_at: c.created_at || new Date(),
    }));
  }

  async getStats(options = {}) {
    // Rebuild to pick up any new calls added to the raw array
    this.#rebuild();

    const { sector = null, since = null, until = null, limit = 200, days = 30 } = options;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sinceDate = since
      ? new Date(since)
      : new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const untilDate = until ? new Date(until) : null;

    // Filter calls
    let filtered = this.#calls.filter((c) => {
      const d = new Date(c.created_at);
      if (d < sinceDate) return false;
      if (untilDate && d > untilDate) return false;
      if (sector && c.sector_id !== sector) return false;
      return true;
    });

    // Summary
    const preferencial = filtered.filter((c) => c.type === "preferencial").length;
    const normal = filtered.filter((c) => c.type === "normal").length;
    const total = filtered.length;
    const todayCount = filtered.filter((c) => {
      const d = new Date(c.created_at);
      return d >= today;
    }).length;

    // By sector
    const sectorMap = new Map();
    for (const c of filtered) {
      sectorMap.set(c.sector_id, (sectorMap.get(c.sector_id) || 0) + 1);
    }
    const bySector = Array.from(sectorMap.entries()).map(([sector, total]) => ({
      sector,
      total,
    }));

    // By type
    const typeMap = new Map();
    for (const c of filtered) {
      typeMap.set(c.type, (typeMap.get(c.type) || 0) + 1);
    }
    const byType = Array.from(typeMap.entries()).map(([type, total]) => ({
      type,
      total,
    }));

    // Recent (most recent first)
    const recent = [...filtered]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit)
      .map((c) => ({
        id: c.id,
        number: c.number_int,
        type: c.type,
        time: new Intl.DateTimeFormat("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(c.created_at)),
      }));

    // Recent by sector
    const recentBySector = {};
    for (const c of recent) {
      const call = filtered.find((f) => f.id === c.id);
      const s = call?.sector_id || "unknown";
      if (!recentBySector[s]) recentBySector[s] = [];
      recentBySector[s].push(c);
    }

    return {
      days,
      summary: { total, today: todayCount, preferencial, normal },
      bySector,
      byType,
      recent,
      recentBySector,
    };
  }
}
