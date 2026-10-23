import type { CallType, SectorId } from '@/shared/constants';

import {
  API_ROUTES,
  HISTORY_LIMITS,
  POLLING_INTERVAL,
  RESET_MARKER_KEY,
  SSE_BACKOFF_BASE,
  SSE_BACKOFF_MAX,
  SSE_EVENT_TYPES,
} from '@/shared/constants';
import { parseJson, readJson } from '@/shared/json';
import { invalidateQueueState } from './queue';

/**
 * Module-level owner of the realtime queue connections.
 *
 * Follows the same idiom as `queue.js` — imperative store plus subscribe
 * callbacks — so components read it through `useSyncExternalStore` instead of
 * each hook instance opening its own EventSource.
 *
 * One EventSource per sector, reference counted: it opens with the first
 * subscriber for that sector and closes with the last. A monitor subscribes to
 * a single sector, so it holds exactly one connection; a panel switching
 * sectors reuses the connection it already has.
 *
 * Reset detection: the server stamps every payload with the sector's `reset_at`
 * marker. A client compares it against the last one it saw and, on a change,
 * drops its local replica — `localStorage` cannot observe a reset performed on
 * another device, and that is what this closes.
 *
 * Two snapshot channels, because consumers cannot tell them apart otherwise:
 *
 *   - `calls`    — the server's *portrait* of the sector, fed by `initialSync`
 *                  and merged into by polling. Consumers reconcile local state
 *                  from it. It is idempotent to re-apply, so a mount cannot
 *                  corrupt anything.
 *   - `lastCall` — an *event*: a call happened just now. Fed only by SSE (and by
 *                  polling once it can prove novelty), cleared on reset and
 *                  when the last subscriber leaves.
 *
 * Conflating the two is what made a consumer re-apply a pre-reset call as the
 * current password on every remount: `initialSync` got an empty list after a
 * reset, so it left the stale `lastCall` in place, and the consumer's fresh
 * `useRef` dedupe passed on its first run.
 */

/** Uma chamada como a UI a consome — vem do SSE ou de `/api/queue/recent`. */
export interface ClientQueueCall {
  readonly id: string;
  readonly number: number;
  readonly type: CallType;
  /** Marcado quando o evento é um recall. */
  readonly isRecall?: boolean;
  /** Só na chamada corrente (999 → 000). */
  readonly wraparound?: boolean;
  /**
   * Instante da chamada em ISO-8601 (UTC).
   *
   * O wire carrega o instante, nunca "HH:mm": é o cliente que formata
   * em BRT (`@/shared/time`), e ele precisa do dia para virar o histórico
   * à meia-noite BRT.
   */
  readonly createdAt: string;
}

export interface QueueEventsSnapshot {
  /** Retrato do setor; `null` quando o setor foi limpo. */
  readonly calls: Partial<Record<SectorId, ClientQueueCall[] | null>>;
  readonly connected: boolean;
  /** Evento mais recente; `null` quando limpo. */
  readonly lastCall: Partial<Record<SectorId, ClientQueueCall | null>>;
}

interface ConnectionState {
  closed: boolean;
  es: EventSource | null;
  lastCallId: null | string;
  open: boolean;
  pollTimer: ReturnType<typeof setInterval> | null;
  retryCount: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
}

/** Payload de `GET /api/queue/recent`. */
interface RecentPayload {
  readonly calls?: ClientQueueCall[] | null;
  readonly error?: string;
  readonly resetAt?: null | string;
}

/** Payload de um evento SSE. */
interface SsePayload {
  readonly call?: ClientQueueCall;
  readonly resetAt?: null | string;
  readonly type?: string;
}

const EMPTY_SNAPSHOT: QueueEventsSnapshot = Object.freeze({
  connected: false,
  calls: {},
  lastCall: {},
});

let snapshot: QueueEventsSnapshot = EMPTY_SNAPSHOT;
const listeners = new Set<() => void>();

/** sector -> connection state */
const connections = new Map<SectorId, ConnectionState>();
/** sector -> number of active subscribers */
const subscriberCount = new Map<SectorId, number>();
/**
 * Setores → marcador de reset. O tipo é `string` (não `SectorId`) porque os
 * valores vêm do `localStorage`, que aceita chave corrompida — o código já
 * trata isso como "nunca visto", e restringir aqui só empurraria cast para o
 * carregamento.
 */
const lastResetAt = new Map<string, null | string>();
/** sectors for which a marker was already seen (the marker itself may be null) */
const seenResetMarker = new Set<string>();
let markersLoaded = false;

/** Test seam: forget all connections and markers. */
export function __resetQueueEvents(): void {
  for (const conn of connections.values()) teardown(conn);
  connections.clear();
  subscriberCount.clear();
  listeners.clear();
  lastResetAt.clear();
  seenResetMarker.clear();
  markersLoaded = false;
  snapshot = EMPTY_SNAPSHOT;
}

/* ── reset marker ─────────────────────────────────────────────── */

export function getQueueEventsSnapshot(): QueueEventsSnapshot {
  return snapshot;
}

/** Subscribe to snapshot changes (used by `useSyncExternalStore`). */
export function subscribeQueueEvents(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Subscribe to realtime events for a sector.
 * @returns unsubscribe
 */
export function subscribeQueueSector(sector: SectorId): () => void {
  if (!isClient() || !sector) return () => {};

  subscriberCount.set(sector, (subscriberCount.get(sector) ?? 0) + 1);
  const conn = ensureConnection(sector);

  let released = false;
  return () => {
    if (released) return;
    released = true;

    const remaining = (subscriberCount.get(sector) ?? 1) - 1;
    if (remaining > 0) {
      subscriberCount.set(sector, remaining);
      return;
    }

    subscriberCount.delete(sector);
    conn.closed = true;
    connections.delete(sector);
    teardown(conn);
    // The next mount starts from zero: without this, `lastCall` outlived the
    // consumer and the fresh `useRef` dedupe let it replay as the current
    // password.
    clearSector(sector);
  };
}

/* ── snapshot reads ───────────────────────────────────────────── */

/**
 * Adopt the first marker seen for a sector, then invalidate on any change.
 *
 * Adoption matters: on a first run the panel has just repopulated localStorage
 * from `/api/queue/recent`, so treating the first marker as a change would wipe
 * it. A marker restored from localStorage is *not* a first run — that is how a
 * reload after a reset the tab never witnessed gets caught.
 *
 * @returns true when the local replica was invalidated
 */
function applyResetMarker(
  sector: SectorId,
  resetAt: null | undefined | string,
): boolean {
  ensureMarkersLoaded();

  const next = resetAt ?? null;
  const known = seenResetMarker.has(sector);
  const previous = known ? (lastResetAt.get(sector) ?? null) : null;

  lastResetAt.set(sector, next);
  seenResetMarker.add(sector);

  if (!known) {
    persistMarker(sector, next);
    return false;
  }

  if (previous === next) return false;

  persistMarker(sector, next);
  invalidateQueueState(sector);
  // Consumers read the snapshot, not `localStorage` — a portrait taken before
  // the reset would otherwise be replayed on the next mount.
  clearSector(sector);
  return true;
}

function callKey(call: ClientQueueCall | null | undefined): string {
  return call?.id ?? `${call?.number}-${call?.type}`;
}

/** Drop both channels of a sector. */
function clearSector(sector: SectorId): void {
  if (!isClient()) return;
  if (!(sector in snapshot.calls) && !(sector in snapshot.lastCall)) return;
  setSnapshot({
    calls: { ...snapshot.calls, [sector]: null },
    lastCall: { ...snapshot.lastCall, [sector]: null },
  });
}

function connect(sector: SectorId, conn: ConnectionState): void {
  if (!isClient() || !sector || conn.closed) return;

  if (conn.es) {
    conn.es.close();
    conn.es = null;
  }

  let es: EventSource;
  try {
    es = new EventSource(`${API_ROUTES.QUEUE_EVENTS}?sector=${sector}`);
  } catch {
    // EventSource unsupported — polling carries the load.
    conn.open = false;
    startPolling(sector, conn);
    return;
  }

  conn.es = es;

  es.onopen = () => {
    if (conn.closed) return;
    conn.retryCount = 0;
    conn.open = true;
    stopPolling(conn);
    refreshConnected();
  };

  es.onmessage = (event: MessageEvent<string>) => {
    if (conn.closed) return;

    let data: SsePayload;
    try {
      data = parseJson<SsePayload>(event.data);
    } catch {
      return;
    }

    if (data.type === SSE_EVENT_TYPES.RESET) {
      applyResetMarker(sector, data.resetAt);
      return;
    }

    // Invalidate before applying the call: a reset that immediately precedes a
    // call must clear the stale replica first, then layer the new call on top.
    applyResetMarker(sector, data.resetAt);

    const call = data.call;
    if (!call) return;

    if (data.type === SSE_EVENT_TYPES.CALL) {
      // SSE is an event by definition — the server emitted it just now.
      conn.lastCallId = call.id;
      setLastCall(sector, call);
      setCalls(sector, mergeCalls([call], snapshot.calls[sector]));
    } else if (data.type === SSE_EVENT_TYPES.RECALL) {
      // A recall repeats a call the portrait already carries; `calls` is
      // untouched so a later reconcile cannot rewind it.
      conn.lastCallId = call.id;
      setLastCall(sector, { ...call, isRecall: true });
    }
  };

  es.onerror = () => {
    if (conn.closed) return;

    es.close();
    conn.es = null;
    conn.open = false;
    refreshConnected();

    startPolling(sector, conn);

    const delay = Math.min(
      SSE_BACKOFF_BASE * Math.pow(2, conn.retryCount),
      SSE_BACKOFF_MAX,
    );
    conn.retryCount += 1;

    conn.retryTimer = setTimeout(() => {
      conn.retryTimer = null;
      if (!conn.closed && !conn.es) connect(sector, conn);
    }, delay);
  };
}

function ensureConnection(sector: SectorId): ConnectionState {
  const existing = connections.get(sector);
  if (existing) return existing;

  const conn: ConnectionState = {
    es: null,
    open: false,
    pollTimer: null,
    retryTimer: null,
    retryCount: 0,
    lastCallId: null,
    closed: false,
  };
  connections.set(sector, conn);

  void initialSync(sector, conn);
  connect(sector, conn);

  return conn;
}

/**
 * Restore markers from localStorage.
 *
 * Without this, a reload would adopt whatever the server reports and never
 * notice a reset that happened while the tab was closed.
 */
function ensureMarkersLoaded(): void {
  if (markersLoaded || !isClient()) return;
  markersLoaded = true;

  try {
    const raw = window.localStorage.getItem(RESET_MARKER_KEY);
    if (!raw) return;
    const parsed = parseJson<Record<string, null | undefined | string>>(raw);
    for (const [sector, value] of Object.entries(parsed)) {
      lastResetAt.set(sector, value ?? null);
      seenResetMarker.add(sector);
    }
  } catch {
    // Corrupted markers: every sector is treated as never seen.
  }
}

async function fetchRecent(
  sector: SectorId,
  limit: number,
): Promise<RecentPayload | null> {
  try {
    const res = await fetch(
      `${API_ROUTES.QUEUE_RECENT}?sector=${sector}&limit=${limit}`,
    );
    if (!res.ok) return null;
    const data = await readJson<RecentPayload>(res);
    return data;
  } catch {
    return null;
  }
}

async function initialSync(
  sector: SectorId,
  conn: ConnectionState,
): Promise<void> {
  // The panel is the largest consumer (100 entries); monitors slice to their
  // own limit. One request satisfies both — cheaper than a per-subscriber GET.
  const data = await fetchRecent(sector, HISTORY_LIMITS.painel);
  if (!data || conn.closed) return;

  applyResetMarker(sector, data.resetAt);

  // A portrait, never an event: writing `lastCall` here is what made consumers
  // apply a pre-reset call as the current password on every mount.
  setCalls(sector, Array.isArray(data.calls) ? data.calls : []);

  // Keep the polling dedupe armed even though nothing was announced.
  if (data.calls?.[0]) conn.lastCallId = data.calls[0].id;
}

function isClient(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Merge a freshly fetched list into the cached portrait, server order first.
 *
 * Polling only asks for a handful of rows, so replacing the cache would cut the
 * panel's history from 100 entries down to 5.
 */
function mergeCalls(
  serverCalls: readonly ClientQueueCall[],
  cached: readonly ClientQueueCall[] | null | undefined,
): ClientQueueCall[] {
  const out = [...serverCalls];
  const seen = new Set(out.map((call) => callKey(call)));
  for (const call of cached ?? []) {
    const key = callKey(call);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(call);
  }
  return out;
}

/* ── server reads ─────────────────────────────────────────────── */

function persistMarker(sector: SectorId, resetAt: null | string): void {
  if (!isClient()) return;
  try {
    const raw = window.localStorage.getItem(RESET_MARKER_KEY);
    const parsed: Record<string, unknown> = raw
      ? parseJson<Record<string, unknown>>(raw)
      : {};
    parsed[sector] = resetAt;
    window.localStorage.setItem(RESET_MARKER_KEY, JSON.stringify(parsed));
  } catch {
    // Non-fatal — detection still works for the rest of the session.
  }
}

/* ── connection lifecycle ─────────────────────────────────────── */

function refreshConnected(): void {
  const anyOpen = [...connections.values()].some((conn) => conn.open);
  if (anyOpen !== snapshot.connected) {
    setSnapshot({ connected: anyOpen });
  }
}

function sameCalls(
  a: readonly ClientQueueCall[],
  b: readonly ClientQueueCall[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((call, i) => callKey(call) === callKey(b[i]));
}

/**
 * Store the sector's portrait.
 *
 * Identity is kept when the contents are unchanged: polling runs every few
 * seconds while the SSE is down, and a fresh array each tick would re-run every
 * consumer's reconcile effect — and therefore rewrite `localStorage` — for
 * nothing.
 */
function setCalls(sector: SectorId, calls: ClientQueueCall[]): void {
  if (!isClient()) return;
  const previous = snapshot.calls[sector];
  if (previous && sameCalls(previous, calls)) return;
  setSnapshot({ calls: { ...snapshot.calls, [sector]: calls } });
}

function setLastCall(sector: SectorId, call: ClientQueueCall): void {
  if (!isClient()) return;
  setSnapshot({ lastCall: { ...snapshot.lastCall, [sector]: call } });
}

/* ── public subscription API ──────────────────────────────────── */

function setSnapshot(patch: Partial<QueueEventsSnapshot>): void {
  snapshot = Object.freeze({ ...snapshot, ...patch });
  for (const cb of listeners) cb();
}

function startPolling(sector: SectorId, conn: ConnectionState): void {
  if (conn.pollTimer) return;

  // `setInterval` espera um callback `void`; o corpo é async, então ele vira
  // uma função nomeada disparada com `void` — o erro segue caindo no
  // try/catch de `fetchRecent`.
  const tick = async (): Promise<void> => {
    if (conn.closed) return;

    const data = await fetchRecent(sector, 5);
    if (!data || conn.closed) return;

    applyResetMarker(sector, data.resetAt);

    const cached = snapshot.calls[sector];
    const latest = data.calls?.[0];
    // A poll payload is a *portrait*, not an event: it only becomes one when
    // the portrait we already hold does not contain that call. Without this,
    // the very first tick after a failed `initialSync` would resurrect the
    // newest pre-reset call as `lastCall`.
    const isNew =
      latest != null && cached != null && cached[0]?.id !== latest.id;

    setCalls(sector, mergeCalls(data.calls ?? [], cached));

    if (isNew) {
      conn.lastCallId = latest.id;
      setLastCall(sector, latest);
    }
  };

  conn.pollTimer = setInterval(() => {
    void tick();
  }, POLLING_INTERVAL);
}

function stopPolling(conn: ConnectionState): void {
  if (!conn.pollTimer) return;
  clearInterval(conn.pollTimer);
  conn.pollTimer = null;
}

function teardown(conn: ConnectionState): void {
  stopPolling(conn);
  if (conn.retryTimer) {
    clearTimeout(conn.retryTimer);
    conn.retryTimer = null;
  }
  if (conn.es) {
    conn.es.close();
    conn.es = null;
  }
  conn.open = false;
  refreshConnected();
}
