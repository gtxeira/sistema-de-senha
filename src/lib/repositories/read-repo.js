import { isSupabaseConfigured, supabase } from "../supabase";
import { isSupabaseAdminConfigured, supabaseAdmin } from "../supabase-admin";

/**
 * Get appropriate database client (anon preferred for reads)
 * @returns {any}
 */
function getDb() {
  // For reads, prefer anon client, fallback to admin if anon not configured
  if (isSupabaseConfigured && supabase) return supabase;
  if (isSupabaseAdminConfigured && supabaseAdmin) return supabaseAdmin;
  return null;
}

/**
 * Build empty response structure
 * @param {number} days
 * @returns {Object}
 */
function emptyResponse(days) {
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
 * @param {Date} date
 * @returns {string}
 */
function formatTime(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Normalize a queue call record for frontend consumption
 * @param {any} call - raw database record
 * @returns {{ id:string, number:number, type:string, time:string }}
 */
function formatCallRecord(call) {
  return {
    id: call.id,
    number: call.number_int,
    type: call.type === "preferential" || call.type === "preferencial" ? "preferencial" : "normal",
    time: formatTime(new Date(call.created_at || Date.now())),
  };
}

export class ReadRepository {
  /**
   * Get stats for a time window with filters
   * @param {{
   *   sector?: 'farmacia'|'recepcao'|null,
   *   since?: Date,
   *   until?: Date|null,
   *   limit?: number
   * }} options
   * @returns {Promise<{
   *   days: number,
   *   summary: { total:number, today:number, preferencial:number, normal:number },
   *   bySector: Array<{sector:string, total:number}>,
   *   byType: Array<{type:string, total:number}>,
   *   recent: Array<{id:string, number:number, type:string, time:string}>,
   *   recentBySector: Record<string, Array<{id:string, number:number, type:string, time:string}>>
   * }>}
   */
  async getStats(options = {}) {
    const db = getDb();
    if (!db) {
      // Return empty structure when no DB configured
      const days = Math.min(90, Math.max(1, Number(options.days) || 30));
      return emptyResponse(days);
    }

    try {
      // Parse options
      const sector = options.sector || null;
      const since = options.since
        ? new Date(options.since)
        : new Date(Date.now() - (options.days || 30) * 24 * 60 * 60 * 1000);
      const until = options.until ? new Date(options.until) : null;
      const limit = options.limit || 200;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayIso = today.toISOString();

      // Build base query
      let query = db
        .from("queue_calls")
        .select("sector_id, type, created_at, number_int")
        .gte("created_at", since.toISOString());

      if (until) query = query.lte("created_at", until.toISOString());
      if (sector) query = query.eq("sector_id", sector);

      // Build recent query (for the list)
      let recentQuery = db
        .from("queue_calls")
        .select("sector_id, number_str, type, created_at, id, number_int")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(limit);

      if (until) recentQuery = recentQuery.lte("created_at", until.toISOString());
      if (sector) recentQuery = recentQuery.eq("sector_id", sector);

      // Execute both queries
      const [allCallsResult, recentCallsResult] = await Promise.all([
        query,
        recentQuery,
      ]);

      if (allCallsResult.error) throw allCallsResult.error;
      if (recentCallsResult.error) throw recentCallsResult.error;

      const calls = allCallsResult.data || [];
      const recent = recentCallsResult.data || [];

      // Calculate totals
      const total = calls.length;
      const todayCount = calls.filter((c) => c.created_at >= todayIso).length;
      const prefCount = calls.filter((c) =>
        ["preferencial", "preferential"].includes(c.type)
      ).length;
      const normalCount = total - prefCount;

      // Group by sector
      const sectorMap = {};
      for (const c of calls) {
        sectorMap[c.sector_id] = (sectorMap[c.sector_id] || 0) + 1;
      }
      const bySector = Object.entries(sectorMap)
        .map(([sector, count]) => ({ sector, total: count }))
        .sort((a, b) => b.total - a.total);

      // Group by type
      const typeMap = {};
      for (const c of calls) {
        typeMap[c.type] = (typeMap[c.type] || 0) + 1;
      }
      const byType = Object.entries(typeMap)
        .map(([type, count]) => ({ type, total: count }))
        .sort((a, b) => b.total - a.total);

      // Format recent calls
      const formattedRecent = recent.map(formatCallRecord);

      // Group recent by sector (max 50 per sector)
      const recentBySector = {};
      for (const item of formattedRecent) {
        const sid = item.id || "desconhecido"; // fallback for id
        if (!recentBySector[sid]) recentBySector[sid] = [];
        if (recentBySector[sid].length < 50) recentBySector[sid].push(item);
      }

      return {
        days: Math.min(90, Math.max(1, Math.ceil((Date.now() - since.getTime()) / (24 * 60 * 60 * 1000)))),
        summary: { total, today: todayCount, preferencial: prefCount, normal: normalCount },
        bySector,
        byType,
        recent: formattedRecent,
        recentBySector,
      };
    } catch (error) {
      // On error, return empty structure instead of 503 to avoid breaking admin UI
      const days = Math.min(90, Math.max(1, Number(options.days) || 30));
      return emptyResponse(days);
    }
  }
}