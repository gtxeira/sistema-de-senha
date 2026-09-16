import { isSupabaseConfigured, getRealtimeClient } from "../supabase";
import { LOCALE, CALL_TYPES } from "../constants.js";

export class RealtimeRepository {
  /**
   * Subscribe to queue inserts for a sector
   * @param {'farmacia'|'recepcao'} sector
   * @param {(call: { id:string, number:number, type:string, time:string }) => void} callback
   * @returns {() => void} unsubscribe function
   */
  subscribeToQueue(sector, callback) {
    // Return unsubscribe function immediately if not configured
    if (!isSupabaseConfigured || !sector) {
      return () => {};
    }

    const db = getRealtimeClient();
    if (!db) {
      return () => {};
    }

    const channel = db
      .channel(`realtime-monitor-${sector}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "queue_calls",
        filter: `sector_id=eq.${sector}`,
      }, (payload) => {
        const call = payload.new;
        if (!call?.number_int) return;

        // Format the call for the callback
        const formattedCall = {
          id: call.id || call.number_int.toString(),
          number: call.number_int,
          type: call.type === CALL_TYPES.PREFERENTIAL || call.type === CALL_TYPES.PREFERENCIAL ? CALL_TYPES.PREFERENCIAL : CALL_TYPES.NORMAL,
          time: new Intl.DateTimeFormat(LOCALE, {
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(call.created_at || Date.now())),
        };

        callback(formattedCall);
      })
      .subscribe();

    // Return unsubscribe function
    return () => {
      db.removeChannel(channel);
    };
  }
}