import { EventEmitter } from "node:events";

/**
 * In-memory pub/sub manager for realtime queue events.
 * Uses Node.js EventEmitter — zero external dependencies.
 *
 * Pattern: "queue:{sector}" events carry formatted call objects.
 */
class EventManager extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  /**
   * Emit a queue call event for a sector.
   * @param {'farmacia'|'recepcao'} sector
   * @param {{ id:string, number:number, type:string, time:string }} call
   */
  emitQueueCall(sector, call) {
    this.emit(`queue:${sector}`, call);
  }

  /**
   * Subscribe to queue calls for a sector.
   * @param {'farmacia'|'recepcao'} sector
   * @param {(call: { id:string, number:number, type:string, time:string }) => void} callback
   * @returns {() => void} unsubscribe function
   */
  subscribeToQueue(sector, callback) {
    const handler = (call) => callback(call);
    this.on(`queue:${sector}`, handler);
    return () => {
      this.off(`queue:${sector}`, handler);
    };
  }

  /**
   * Get the number of active listeners for a sector (for testing/debugging).
   * @param {'farmacia'|'recepcao'} sector
   * @returns {number}
   */
  getSubscriberCount(sector) {
    return this.listenerCount(`queue:${sector}`);
  }
}

export { EventManager };
export const eventManager = new EventManager();
