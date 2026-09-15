/**
 * In-memory implementation of RealtimeRepository for fast contract testing.
 * Simulates subscriptions using a simple callback registry.
 */
export class InMemoryRealtimeRepository {
  #subscriptions = new Map(); // sector → Set<callback>
  #unsubscribed = new WeakSet();

  subscribeToQueue(sector, callback) {
    if (!sector) return () => {};

    if (!this.#subscriptions.has(sector)) {
      this.#subscriptions.set(sector, new Set());
    }
    this.#subscriptions.get(sector).add(callback);

    return () => {
      this.#unsubscribed.add(callback);
      const set = this.#subscriptions.get(sector);
      if (set) set.delete(callback);
    };
  }

  // --- Test helpers (not part of the interface) ---

  /**
   * Simulate a database INSERT event.
   * @param {string} sector
   * @param {{ id:string, number_int:number, type:string, created_at?:string }} payload
   */
  async emit(sector, payload) {
    const callbacks = this.#subscriptions.get(sector);
    if (!callbacks) return;

    // Skip if number_int is missing (matches real Supabase behavior)
    if (!payload?.number_int) return;

    for (const cb of callbacks) {
      if (this.#unsubscribed.has(cb)) continue;

      const formattedCall = {
        id: payload.id || String(payload.number_int),
        number: payload.number_int,
        type:
          payload.type === "preferential" || payload.type === "preferencial"
            ? "preferencial"
            : "normal",
        time: new Intl.DateTimeFormat("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(payload.created_at || Date.now())),
      };

      cb(formattedCall);
    }
  }
}
