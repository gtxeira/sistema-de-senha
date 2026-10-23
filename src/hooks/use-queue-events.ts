'use client';

import type { ClientQueueCall } from '@/client/queue/queue-events';
import type { SectorId } from '@/shared/constants';

import { useEffect, useSyncExternalStore } from 'react';

import {
  getQueueEventsSnapshot,
  subscribeQueueEvents,
  subscribeQueueSector,
} from '@/client/queue/queue-events';

export interface QueueEventsResult {
  readonly calls: ClientQueueCall[] | null;
  readonly connected: boolean;
  readonly lastCall: ClientQueueCall | null;
}

/**
 * Realtime queue events for a sector, with automatic polling fallback.
 *
 * The connection itself lives in the `queue-events` module singleton, so
 * several components — or a panel switching sectors — share it instead of each
 * opening its own EventSource.
 *
 * @param sector setor a assinar; `null` (ou ausente) não assina nada.
 *
 * `calls` is the server's portrait of the sector — reconcile local state from
 * it. `lastCall` is an event — a call happened just now. They are different
 * channels on purpose: a portrait replayed on mount must never be applied as
 * the current password.
 */
export function useQueueEvents(sector: SectorId | null): QueueEventsResult {
  const snapshot = useSyncExternalStore(
    subscribeQueueEvents,
    getQueueEventsSnapshot,
    getQueueEventsSnapshot,
  );

  // Reference-counted per sector: while `sector` is set this holds one
  // subscription; the connection closes when the last subscriber leaves.
  useEffect(() => {
    if (!sector) return;
    return subscribeQueueSector(sector);
  }, [sector]);

  return {
    connected: snapshot.connected,
    calls: sector ? (snapshot.calls[sector] ?? null) : null,
    lastCall: sector ? (snapshot.lastCall[sector] ?? null) : null,
  };
}
