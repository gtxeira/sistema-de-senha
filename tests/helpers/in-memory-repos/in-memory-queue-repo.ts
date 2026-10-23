import type { SequenceType } from '@/shared/constants';
import type {
  QueueCallInput,
  QueueRepository,
  RecentCall,
} from '@/server/repositories/types';

/** Linha persistida: o input da chamada + id gerado e timestamp monotônico. */
interface StoredCall extends QueueCallInput {
  readonly id: string;
  readonly created_at: Date;
}

/**
 * In-memory implementation of QueueRepository for fast contract testing.
 * No external dependencies — uses Map and Array.
 */
export class InMemoryQueueRepository implements QueueRepository {
  #sequences = new Map<string, number>(); // "sector:type" → current_number
  #calls: StoredCall[] = [];
  #resetAt = new Map<string, Date>(); // sector → Date
  #clock = 0;

  /**
   * Monotonic timestamp source. Guarantees strict ordering between calls and
   * resets even within the same millisecond, so `created_at >= resetAt`
   * filtering is deterministic.
   */
  #now(): Date {
    this.#clock = Math.max(Date.now(), this.#clock + 1);
    return new Date(this.#clock);
  }

  async nextNumber(
    sector: string,
    type: SequenceType,
  ): Promise<{ number: number; wraparound: boolean }> {
    const key = `${sector}:${type}`;
    const current = this.#sequences.has(key)
      ? (this.#sequences.get(key) ?? -1)
      : -1;

    const next = current + 1;
    const wraparound = next > 999;

    if (wraparound) {
      this.#sequences.set(key, 0);
      return { number: 0, wraparound: true };
    }

    this.#sequences.set(key, next);
    return { number: next, wraparound: false };
  }

  async saveCall(
    call: QueueCallInput,
  ): Promise<{ id: string; createdAt: string }> {
    const id = crypto.randomUUID();
    const createdAt = this.#now();
    this.#calls.push({
      ...call,
      id,
      created_at: createdAt,
    });
    // O instante gravado, não "agora" — é o valor que virou registro.
    return { id, createdAt: createdAt.toISOString() };
  }

  async resetSector(sector: string): Promise<void> {
    for (const key of this.#sequences.keys()) {
      if (key.startsWith(`${sector}:`)) {
        this.#sequences.set(key, -1);
      }
    }
    this.#resetAt.set(sector, this.#now());
  }

  async getSectorResetAt(sector: string): Promise<Date | null> {
    return this.#resetAt.get(sector) ?? null;
  }

  async getRecentCalls(
    sector: string,
    limit = 30,
    resetAt: Date | null = null,
  ): Promise<RecentCall[]> {
    return this.#calls
      .filter((c) => c.sector === sector)
      .filter((c) => !resetAt || c.created_at >= resetAt)
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
      .slice(0, limit)
      .map((c) => ({
        id: c.id,
        number: c.number,
        type: c.sequenceType === 'preferencial' ? 'preferencial' : 'normal',
        // O INSTANTE, não "HH:mm": quem exibe formata em BRT, e o
        // cliente precisa do dia para fazer a virada do histórico.
        createdAt: c.created_at.toISOString(),
      }));
  }

  async setNextNumber(
    sector: string,
    type: SequenceType,
    nextNumber: number,
  ): Promise<void> {
    const num = Number(nextNumber);
    if (!Number.isInteger(num) || num < 0 || num > 999) {
      throw new Error('Número inválido. Use um valor entre 0 e 999.');
    }
    // Store nextNumber - 1 because nextNumber() increments before returning
    const key = `${sector}:${type}`;
    this.#sequences.set(key, num - 1);
  }

  // --- Test helpers (not part of the interface) ---

  /** Get all saved calls. */
  getCalls(): StoredCall[] {
    return [...this.#calls];
  }

  /** Get current sequence value for a sector+type. */
  getSequence(sector: string, type: SequenceType): number {
    return this.#sequences.get(`${sector}:${type}`) ?? -1;
  }
}
