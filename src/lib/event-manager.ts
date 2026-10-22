import { EventEmitter } from "node:events";
import { MAX_SSE_CONNECTIONS_PER_SECTOR } from "./constants";
import type { CallType } from "./constants";

/**
 * Payload serializado no SSE. `wraparound` só existe na chamada corrente
 * (recall repete a última senha e não tem novo número), por isso opcional.
 *
 * `createdAt` é o INSTANTE da chamada em ISO-8601 (UTC) — o wire
 * carrega instantes, e quem formata em BRT é o cliente.
 */
export interface QueueCallEvent {
  readonly id: string;
  readonly number: number;
  readonly type: CallType;
  readonly createdAt: string;
  readonly wraparound?: boolean;
}

export type QueueCallListener = (call: QueueCallEvent, resetAt: string | null) => void;
export type QueueResetListener = (resetAt: string | null) => void;
export type Unsubscribe = () => void;

/**
 * In-memory pub/sub manager for realtime queue events.
 * Uses Node.js EventEmitter — zero external dependencies.
 *
 * Pattern: "queue:{sector}" events carry formatted call objects, with the
 * sector's reset marker passed alongside as the second argument.
 *
 * `sector` é `string` de propósito: os setores vêm do corpo da request e do
 * pathname, e já são validados na borda (`Object.hasOwn(SECTORS, …)`) antes
 * de chegar aqui — restringir o tipo aqui só empurraria casts para as rotas.
 */
class EventManager extends EventEmitter {
  constructor() {
    super();
    // Keep in sync with MAX_SSE_CONNECTIONS_PER_SECTOR: exceeding the cap is
    // rejected at the route, so listeners should never pile up past this.
    this.setMaxListeners(MAX_SSE_CONNECTIONS_PER_SECTOR);
  }

  /** Emit a queue call event for a sector. */
  emitQueueCall(sector: string, call: QueueCallEvent, resetAt: string | null = null): void {
    this.emit(`queue:${sector}`, call, resetAt);
  }

  /** Emit a queue recall event for a sector. */
  emitQueueRecall(sector: string, call: QueueCallEvent, resetAt: string | null = null): void {
    this.emit(`queue:recall:${sector}`, call, resetAt);
  }

  /** Emit a queue reset event for a sector. */
  emitQueueReset(sector: string, resetAt: string | null = null): void {
    this.emit(`queue:reset:${sector}`, resetAt);
  }

  /** Subscribe to queue calls for a sector. @returns unsubscribe function */
  subscribeToQueue(sector: string, callback: QueueCallListener): Unsubscribe {
    const handler = (call: QueueCallEvent, resetAt: string | null) => callback(call, resetAt);
    this.on(`queue:${sector}`, handler);
    return () => {
      this.off(`queue:${sector}`, handler);
    };
  }

  /** Subscribe to queue recall events for a sector. @returns unsubscribe function */
  subscribeToRecall(sector: string, callback: QueueCallListener): Unsubscribe {
    const handler = (call: QueueCallEvent, resetAt: string | null) => callback(call, resetAt);
    this.on(`queue:recall:${sector}`, handler);
    return () => {
      this.off(`queue:recall:${sector}`, handler);
    };
  }

  /** Subscribe to queue reset events for a sector. @returns unsubscribe function */
  subscribeToReset(sector: string, callback: QueueResetListener): Unsubscribe {
    const handler = (resetAt: string | null) => callback(resetAt);
    this.on(`queue:reset:${sector}`, handler);
    return () => {
      this.off(`queue:reset:${sector}`, handler);
    };
  }

  /** Get the number of active listeners for a sector (for testing/debugging). */
  getSubscriberCount(sector: string): number {
    return this.listenerCount(`queue:${sector}`);
  }

  /** Get the number of active recall listeners for a sector (for testing/debugging). */
  getRecallSubscriberCount(sector: string): number {
    return this.listenerCount(`queue:recall:${sector}`);
  }

  /** Get the number of active reset listeners for a sector (for testing/debugging). */
  getResetSubscriberCount(sector: string): number {
    return this.listenerCount(`queue:reset:${sector}`);
  }
}

export { EventManager };
export const eventManager = new EventManager();
