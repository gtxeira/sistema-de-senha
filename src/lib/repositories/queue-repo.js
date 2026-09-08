import { isSupabaseAdminConfigured, supabaseAdmin } from "../supabase-admin";
import { isSupabaseConfigured, supabase } from "../supabase";
import { normalizeCallType, formatNumberString, isInvalidApiKeyError } from "./utils";

/**
 * Get the appropriate database client
 * @returns {any} Supabase client (admin preferred, fallback to anon)
 */
function getQueueDb() {
  if (isSupabaseAdminConfigured && supabaseAdmin) return supabaseAdmin;
  if (isSupabaseConfigured && supabase) return supabase;
  return null;
}

/**
 * Helper to increment via RPC (call_queue function)
 * @param {any} db - Supabase client
 * @param {'farmacia'|'recepcao'} sector
 * @param {'normal'|'preferencial'} sequenceType
 * @returns {Promise<number|null>}
 */
async function incrementViaRpc(db, sector, sequenceType) {
  try {
    const { data, error } = await db.rpc("call_queue", {
      p_sector_id: sector,
      p_call_type: sequenceType,
    });
    if (error || data == null) return null;
    const result = typeof data === "object" ? data : { number: data };
    const number = Number(
      result.number ??
        result.queue_number ??
        result.current_number ??
        result.next_number,
    );
    return Number.isInteger(number) && number >= 1 ? number : null;
  } catch {
    return null;
  }
}

/**
 * Helper to increment current number in queue_sequences table
 * @param {any} db - Supabase client
 * @param {'farmacia'|'recepcao'} sector
 * @param {'normal'|'preferencial'} sequenceType
 * @returns {Promise<number>}
 */
async function incrementCurrentNumber(db, sector, sequenceType) {
  const { data: seq, error } = await db
    .from("queue_sequences")
    .select("current_number")
    .eq("sector_id", sector)
    .eq("call_type", sequenceType)
    .maybeSingle();

  if (error && !String(error.message || "").includes("column")) {
    throw error;
  }

  if (seq && Object.prototype.hasOwnProperty.call(seq, "current_number")) {
    const nextNum = nextValue(seq.current_number);
    const { error: updateError } = await db
      .from("queue_sequences")
      .update({
        current_number: nextNum,
        updated_at: new Date().toISOString(),
      })
      .eq("sector_id", sector)
      .eq("call_type", sequenceType);
    if (updateError) throw updateError;
    return nextNum;
  }

  const { error: insertError } = await db.from("queue_sequences").insert({
    sector_id: sector,
    call_type: sequenceType,
    current_number: 1,
  });
  if (insertError) throw insertError;
  return 1;
}

/**
 * Helper to increment legacy columns (priority_current/normal_current)
 * @param {any} db - Supabase client
 * @param {'farmacia'|'recepcao'} sector
 * @param {'normal'|'preferencial'} sequenceType
 * @returns {Promise<number|null>}
 */
async function incrementLegacyColumns(db, sector, sequenceType) {
  const field =
    sequenceType === "preferencial" ? "priority_current" : "normal_current";
  const { data: rows, error } = await db
    .from("queue_sequences")
    .select("*")
    .eq("sector_id", sector)
    .limit(1);

  if (error) throw error;
  const seqData = rows?.[0];
  if (!seqData || !(field in seqData)) return null;

  const nextNum = nextValue(seqData[field]);
  const { error: updateError } = await db
    .from("queue_sequences")
    .update({
      [field]: nextNum,
      call_type: sequenceType,
      updated_at: new Date().toISOString(),
    })
    .eq("sector_id", sector);
  if (updateError) throw updateError;
  return nextNum;
}

/**
 * Get next value with wraparound at 1000
 * @param {number} current
 * @returns {number}
 */
function nextValue(current) {
  const value = Number(current) || 0;
  return value >= 1000 ? 1 : value + 1;
}

/**
 * Get recent calls for a sector (for monitor history)
 * @param {'farmacia'|'recepcao'} sector
 * @param {number} limit
 * @returns {Promise<Array<{
 *   id: string,
   *   number: number,
   *   type: string,
   *   time: string
 * }>>}
 */
export async function getRecentCalls(sector, limit = 30) {
  const db = getQueueDb();
  if (!db) return [];
  try {
    const { data, error } = await db
      .from("queue_calls")
      .select("id, number_int, type, created_at")
      .eq("sector_id", sector)
      .order("id", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map(call => ({
      id: String(call.id),
      number: call.number_int,
      type: call.type === "preferential" || call.type === "preferencial" ? "preferencial" : "normal",
      time: new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" })
        .format(new Date(call.created_at || Date.now())),
    }));
  } catch (err) {
    return [];
  }
}

export class QueueRepository {
  /**
   * Get next number for sector and type (normal/preferencial)
   * @param {'farmacia'|'recepcao'} sector
   * @param {'normal'|'preferencial'} type
   * @returns {Promise<number>}
   */
  async nextNumber(sector, type) {
    const db = getQueueDb();
    if (!db) {
      throw new Error("Database not configured");
    }

    const { sequenceType, callType } = normalizeCallType(type);
    
    // Try RPC first
    const fromRpc = await incrementViaRpc(db, sector, sequenceType);
    if (fromRpc) return fromRpc;

    // Fallback to direct table access
    try {
      return await incrementCurrentNumber(db, sector, sequenceType);
    } catch (error) {
      const legacy = await incrementLegacyColumns(db, sector, sequenceType);
      if (legacy) return legacy;
      throw error;
    }
  }

  /**
   * Save a queue call
   * @param {{
   *   sector: 'farmacia'|'recepcao',
   *   number: number,
   *   numberStr: string,
   *   sequenceType: 'normal'|'preferencial',
   *   callType: 'normal'|'preferencial',
   *   attendantId: string|null
   * }} call
   * @returns {Promise<void>}
   */
  async saveCall(call) {
    const db = getQueueDb();
    if (!db) {
      throw new Error("Database not configured");
    }

    const { sector, number, numberStr, sequenceType, callType, attendantId } = call;
    const callerId = attendantId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attendantId)
      ? attendantId
      : null;

    const base = {
      sector_id: sector,
      type: callType,
      number_int: number,
      number_str: numberStr,
    };

    // Try primary insert with called_by
    const primary = await db.from("queue_calls").insert({
      ...base,
      called_by: callerId,
    });

    if (!primary.error) return;

    // Fallback to legacy columns if primary fails
    const fallback = await db.from("queue_calls").insert({
      ...base,
      call_type: sequenceType,
      attendant_id: callerId,
    });

    if (fallback.error) throw fallback.error;
  }

  /**
   * Reset sequence for sector
   * @param {'farmacia'|'recepcao'} sector
   * @returns {Promise<void>}
   */
  async resetSector(sector) {
    const db = getQueueDb();
    if (!db) {
      throw new Error("Database not configured");
    }

    const now = new Date().toISOString();
    const currentNumberReset = await db
      .from("queue_sequences")
      .update({ current_number: 0, updated_at: now })
      .eq("sector_id", sector);

    if (!currentNumberReset.error) return;

    const legacyReset = await db
      .from("queue_sequences")
      .update({
        normal_current: 0,
        priority_current: 0,
        updated_at: now,
      })
      .eq("sector_id", sector);

    if (legacyReset.error) throw currentNumberReset.error;
  }
}