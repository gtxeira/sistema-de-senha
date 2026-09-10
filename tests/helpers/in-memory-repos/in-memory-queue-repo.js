/**
 * In-memory implementation of QueueRepository for fast contract testing.
 * No external dependencies — uses Map and Array.
 */
export class InMemoryQueueRepository {
  #sequences = new Map(); // "sector:type" → current_number
  #calls = [];

  async nextNumber(sector, type) {
    const key = `${sector}:${type}`;
    const current = this.#sequences.get(key) || 0;
    const next = current + 1;
    this.#sequences.set(key, next);
    return next;
  }

  async saveCall(call) {
    this.#calls.push({
      ...call,
      id: crypto.randomUUID(),
      created_at: new Date(),
    });
  }

  async resetSector(sector) {
    for (const key of this.#sequences.keys()) {
      if (key.startsWith(`${sector}:`)) {
        this.#sequences.set(key, 0);
      }
    }
  }

  // --- Test helpers (not part of the interface) ---

  /** Get all saved calls. */
  getCalls() {
    return [...this.#calls];
  }

  /** Get current sequence value for a sector+type. */
  getSequence(sector, type) {
    return this.#sequences.get(`${sector}:${type}`) || 0;
  }
}
