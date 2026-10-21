import {
  SECTORS,
  GUICHES,
  QUEUE_KEY,
  DEFAULT_SECTOR,
  ALL_SECTORS,
  MAX_QUEUE_NUMBER,
  MIN_QUEUE_NUMBER,
  CALL_TYPES,
  TYPE_FIELDS,
  TYPE_LABELS,
  TYPE_PREFIXES,
  HISTORY_LIMITS,
  NO_PASSWORD,
} from "./constants";
import type { CallType } from "./constants";
import { parseJson, readJson } from "./json";
import type { QueueCallBody } from "@/types/api";

export {
  SECTORS,
  GUICHES,
  QUEUE_KEY,
  DEFAULT_SECTOR,
  ALL_SECTORS,
  MAX_QUEUE_NUMBER,
  MIN_QUEUE_NUMBER,
  CALL_TYPES,
  TYPE_FIELDS,
  TYPE_LABELS,
  TYPE_PREFIXES,
  NO_PASSWORD,
};

/* ─── Tipos ─────────────────────────────────────────────────────── */

/**
 * Item do histórico visual de uma fila.
 *
 * Mesmo formato de `QueueCallRecord` (o que o servidor devolve), com dois
 * campos relaxados: `number` pode vir como string de payloads legados de
 * `localStorage`, e `id`/`createdAt` só existem quando a entrada veio da API
 * — itens criados localmente a partir do SSE não têm.
 */
export interface QueueHistoryEntry {
  /** Presente só em payloads do servidor — itens locais não têm. */
  readonly id?: string;
  readonly number: number | string;
  readonly type: CallType;
  /** Hora `HH:mm`; a UI converte para o fuso, então precisa existir. */
  readonly time: string;
  /** ISO ou `null` (null quando o registro não tem reset_at). */
  readonly createdAt?: string | null;
}

/** Senha atual de um tipo: `NO_PASSWORD` (= `null`) quando não há. */
export type CurrentPassword = number | null;

export interface QueueEntry {
  readonly normalCurrent: CurrentPassword;
  readonly priorityCurrent: CurrentPassword;
  readonly history: QueueHistoryEntry[];
  /** Dia local (`YYYY-MM-DD`) a que o histórico pertence. */
  readonly historyDate: string;
  /** Campo anterior à separação por tipo — só aparece em payloads antigos. */
  readonly current?: CurrentPassword;
}

/**
 * Estado da fila persistido em `localStorage`.
 *
 * `Record<string, …>` e não `Record<SectorId, …>`: o valor vem de
 * `JSON.parse` e os chamadores (painel, monitor, admin) recebem `sector` como
 * `string`. O guard de setor é `Object.hasOwn(SECTORS, sector)` em cada
 * entrada — e o TS não estreita com `hasOwn`, como já valeu nos
 * repositórios.
 */
export type QueueState = Record<string, QueueEntry>;

/** Resultado de `callNextNumber` — união discriminada por `ok`. */
export type CallNextResult =
  | { readonly ok: true; readonly next: number; readonly type: CallType }
  | { readonly ok: false; readonly error: string };

export interface ReconcileOptions {
  readonly historyLimit?: number;
}

/* ─── Estado do módulo ──────────────────────────────────────────── */

const serverQueueSnapshot: QueueState = {
  farmacia: {
    normalCurrent: NO_PASSWORD,
    priorityCurrent: NO_PASSWORD,
    history: [],
    historyDate: "",
  },
  recepcao: {
    normalCurrent: NO_PASSWORD,
    priorityCurrent: NO_PASSWORD,
    history: [],
    historyDate: "",
  },
};

let clientQueueSnapshot: QueueState | null = null;
let clientQueueRaw: string | null = null;
let hasClientQueueSnapshot = false;

// Usuários movidos para o banco de dados (tabela profiles + auth.users)

function localDateKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function nextQueueNumber(current?: CurrentPassword): number {
  if (current === undefined || current === null) {
    return MIN_QUEUE_NUMBER;
  }

  const next = Number(current) + 1;
  return next > MAX_QUEUE_NUMBER ? MIN_QUEUE_NUMBER : next;
}

export function formatQueueNumber(
  number: number | string | null | undefined,
  type: CallType = "normal",
): string {
  const prefix =
    type === "preferencial" || type === "preferential"
      ? TYPE_PREFIXES.preferencial
      : TYPE_PREFIXES.normal;
  if (number === null || number === undefined) return `${prefix}---`;
  return `${prefix}${String(Number(number)).padStart(3, "0")}`;
}

export function getInitialState(): QueueState {
  return {
    farmacia: {
      normalCurrent: NO_PASSWORD,
      priorityCurrent: NO_PASSWORD,
      history: [],
      historyDate: localDateKey(),
    },
    recepcao: {
      normalCurrent: NO_PASSWORD,
      priorityCurrent: NO_PASSWORD,
      history: [],
      historyDate: localDateKey(),
    },
  };
}

export function clearHistoryFromNewDay(state: QueueState): QueueState {
  const today = localDateKey();
  let changed = false;
  const nextState: QueueState = Object.fromEntries(
    Object.entries(state).map(([sector, queue]) => {
      if (queue.historyDate === today) return [sector, queue];
      changed = true;
      return [
        sector,
        {
          ...queue,
          // PRESERVA os contadores — nunca zera ao mudar de dia
          normalCurrent:
            queue.normalCurrent ?? queue.current ?? NO_PASSWORD,
          priorityCurrent: queue.priorityCurrent ?? NO_PASSWORD,
          // Limpa apenas o histórico visual
          history: [],
          historyDate: today,
        },
      ];
    }),
  );
  if (changed && typeof window !== "undefined")
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(nextState));
  return nextState;
}

export function readQueueState(): QueueState {
  if (typeof window === "undefined") return getInitialState();
  try {
    const saved = window.localStorage.getItem(QUEUE_KEY);
    if (!saved) return getInitialState();
    const parsed = parseJson<QueueState>(saved);
    return clearHistoryFromNewDay(parsed);
  } catch {
    return getInitialState();
  }
}

export function saveQueueState(state: QueueState): void {
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("queue-updated", { detail: state }));
}

/**
 * Drop a sector's queue back to "no current password" — used when the server
 * queue is reset from another device, which localStorage cannot observe.
 *
 * Deliberately writes through `saveQueueState` instead of calling
 * `localStorage.removeItem`:
 *   1. the `storage` event only fires in *other* tabs, so this tab needs
 *      `queue-updated` to converge;
 *   2. `getQueueSnapshot` memoizes on `clientQueueRaw` and would otherwise hand
 *      back stale data even with the key gone;
 *   3. `subscribeQueue` listens to `queue-updated` and `storage` only.
 *
 * @param sector single sector, or null for every sector
 */
export function invalidateQueueState(sector: string | null = null): void {
  clientQueueRaw = null;
  clientQueueSnapshot = null;
  hasClientQueueSnapshot = false;

  const current = readQueueState();
  const targets =
    sector && Object.hasOwn(SECTORS, sector) ? [sector] : Object.keys(SECTORS);

  const next = { ...current };
  for (const s of targets) {
    next[s] = {
      ...normalizeQueue(current[s]),
      normalCurrent: NO_PASSWORD,
      priorityCurrent: NO_PASSWORD,
      history: [],
      historyDate: localDateKey(),
    };
  }

  saveQueueState(next);
}

/**
 * Guarda defensiva contra o que veio do `JSON.parse` do storage, sem deixar o
 * valor virar `any`.
 *
 * `Array.isArray` tem assinatura `arg is any[]`: ele estreita qualquer coisa
 * para `any[]` e derruba o tipo de toda a função seguinte. Com o elemento
 * declarado, o `if` continua cobrindo o caso não-array e o resto segue tipado.
 */
function isQueueHistory(value: unknown): value is readonly QueueHistoryEntry[] {
  return Array.isArray(value);
}

/**
 * Drop malformed entries and deduplicate by number+type.
 *
 * Locally created items have no `id`, so the id cannot take part in the key.
 * Keeps the *first* occurrence — passing newest-first keeps newest-first.
 */
export function cleanHistory(
  history: readonly QueueHistoryEntry[] = [],
): QueueHistoryEntry[] {
  if (!isQueueHistory(history)) return [];
  const seen = new Set<string>();
  return history.filter((item) => {
    if (item?.number == null) return false;
    const key = `${item.number}-${item.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function historyKey(call?: QueueHistoryEntry | null): string {
  return `${call?.number}-${call?.type}`;
}

/**
 * Local day of an ISO timestamp, in the same format as `localDateKey`.
 *
 * Comparing `createdAt.slice(0, 10)` would use UTC: a call placed at 22:00 in
 * UTC-3 belongs to tomorrow on the wire, and would be dropped as "tomorrow's".
 */
function localDayKey(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Canonical call shape — the API has emitted both spellings of "preferential". */
function normalizeCalls(
  calls?: readonly QueueHistoryEntry[],
): QueueHistoryEntry[] {
  if (!isQueueHistory(calls)) return [];
  return calls
    .filter((call) => call?.number != null)
    .map((call) => ({
      ...call,
      type:
        call.type === CALL_TYPES.PREFERENCIAL || call.type === CALL_TYPES.PREFERENTIAL
          ? CALL_TYPES.PREFERENCIAL
          : CALL_TYPES.NORMAL,
    }));
}

/**
 * Make a sector's local replica agree with the server's post-reset call list.
 *
 * This is the *portrait* path: idempotent, safe to run on every mount and on
 * every snapshot change, and it never announces anything — unlike the live
 * `lastCall` path, which is what makes a monitor speak.
 *
 * Three rules:
 *
 *   1. empty list → the sector has no calls since its reset, so anything local
 *      is pre-reset residue and gets dropped. This is the branch that keeps
 *      `---` on screen after a reset performed on another device.
 *   2. non-empty but every call predates today → nothing to do. The daily
 *      rollover (`clearHistoryFromNewDay`) deliberately clears the visual
 *      history while keeping the counters, and `getRecentCalls` filters by
 *      `reset_at`, not by day — writing the server's list here would resurrect
 *      yesterday's history.
 *   3. otherwise → adopt `todays[0]` as the current password **only** when it
 *      is absent from the local history. See the race guard below.
 *
 * The race guard: `callNextNumber` writes the number to `localStorage` before
 * the server confirms it (see `saveQueueState` just above), so a portrait that
 * predates the commit would otherwise revert the call the user just made. If
 * the portrait already contains `calls[0]`, this client knows that call —
 * whatever is newest is the password it just wrote, not the portrait.
 *
 * History is *merged*, never replaced, and monotonically so: an entry already
 * applied locally can only disappear if the server says it is pre-reset, which
 * case 1 handles.
 *
 * @param calls newest-first, already filtered by `reset_at`
 */
export function reconcileQueueFromCalls(
  sector: string,
  calls?: readonly QueueHistoryEntry[],
  { historyLimit = HISTORY_LIMITS.painel }: ReconcileOptions = {},
): void {
  if (!sector || !Object.hasOwn(SECTORS, sector)) return;

  const server = normalizeCalls(calls);
  const current = readQueueState();
  const local = normalizeQueue(current[sector]);

  if (server.length === 0) {
    const clean =
      local.normalCurrent === NO_PASSWORD &&
      local.priorityCurrent === NO_PASSWORD &&
      local.history.length === 0;
    if (clean) return; // already `---`: no point waking every subscriber up
    invalidateQueueState(sector);
    return;
  }

  // Entries without a date are kept: payloads predating this field (and the
  // tests that build calls by hand) must not silently fall into case 2.
  const todays = server.filter(
    (call) => !call.createdAt || localDayKey(call.createdAt) === localDateKey(),
  );
  if (todays.length === 0) return; // case 2

  const newest = todays[0];
  const known = new Set(local.history.map(historyKey));
  const adopt = !known.has(historyKey(newest));
  const field = TYPE_FIELDS[newest.type] ?? TYPE_FIELDS.normal;

  saveQueueState({
    ...current,
    [sector]: {
      ...local,
      [field]: adopt ? newest.number : local[field],
      history: cleanHistory([...todays, ...local.history]).slice(0, historyLimit),
    },
  });
}

export function normalizeQueue(
  queue?: Partial<QueueEntry> | null,
): QueueEntry {
  return {
    normalCurrent: queue?.normalCurrent ?? queue?.current ?? NO_PASSWORD,
    priorityCurrent: queue?.priorityCurrent ?? NO_PASSWORD,
    history: queue?.history ?? [],
    historyDate: queue?.historyDate ?? localDateKey(),
  };
}

export async function withQueueLock<T>(callback: () => Promise<T>): Promise<T> {
  if (navigator?.locks?.request)
    return navigator.locks.request(
      "saude-queue-call",
      { mode: "exclusive" },
      callback,
    );
  const lockKey = `${QUEUE_KEY}-lock`;
  const token = `${Date.now()}-${Math.random()}`;
  while (true) {
    const raw = window.localStorage.getItem(lockKey) || "";
    const lockTime = Number(String(raw).split(":")[0] || 0);
    if (!lockTime || Date.now() - lockTime > 3000) {
      window.localStorage.setItem(lockKey, `${Date.now()}:${token}`);
      if (window.localStorage.getItem(lockKey)?.endsWith(token)) break;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 40));
  }
  try {
    return await callback();
  } finally {
    if (window.localStorage.getItem(lockKey)?.endsWith(token))
      window.localStorage.removeItem(lockKey);
  }
}

// Bip desativado permanentemente
export function playCallAlert(): void {
  return;
}

export function subscribeQueue(callback: () => void): () => void {
  window.addEventListener("queue-updated", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("queue-updated", callback);
    window.removeEventListener("storage", callback);
  };
}

export function getQueueSnapshot(): QueueState {
  const raw = window.localStorage.getItem(QUEUE_KEY);
  // `clientQueueSnapshot` é non-null sempre que `hasClientQueueSnapshot` está
  // true; a checagem extra existe só para o TS enxergar o invariante.
  if (raw === clientQueueRaw && hasClientQueueSnapshot && clientQueueSnapshot)
    return clientQueueSnapshot;
  clientQueueSnapshot = readQueueState();
  // readQueueState pode normalizar o estado do dia e atualizar o localStorage.
  clientQueueRaw = window.localStorage.getItem(QUEUE_KEY);
  hasClientQueueSnapshot = true;
  return clientQueueSnapshot;
}

export function getServerQueueSnapshot(): QueueState {
  return serverQueueSnapshot;
}

export async function callNextNumber({
  sector,
  type,
}: {
  sector: string;
  type: CallType;
}): Promise<CallNextResult> {
  return withQueueLock(async () => {
    let next: number | null = null;
    try {
      const res = await fetch("/api/queue/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sector, type }),
      });
      const data = await readJson<QueueCallBody>(res);
      if (!res.ok) {
        if (data.useLocal) {
          const ls = normalizeQueue(readQueueState()[sector]);
          next = type === "preferencial"
            ? nextQueueNumber(ls.priorityCurrent)
            : nextQueueNumber(ls.normalCurrent);
        } else {
          return { ok: false, error: data.error || "Erro ao conectar à sequência central." };
        }
      } else {
        next = Number(data.number);
      }
    } catch {
      const ls = normalizeQueue(readQueueState()[sector]);
      next = type === "preferencial"
        ? nextQueueNumber(ls.priorityCurrent)
        : nextQueueNumber(ls.normalCurrent);
    }

    next = Number(next);
    if (!Number.isInteger(next) || next < MIN_QUEUE_NUMBER || next > MAX_QUEUE_NUMBER) {
      return { ok: false, error: "Número de senha inválido." };
    }

    const latest = readQueueState();
    const q = normalizeQueue(latest[sector]);
    const field = type === "preferencial" ? "priorityCurrent" : "normalCurrent";

    saveQueueState({
      ...latest,
      [sector]: { ...q, [field]: next },
    });

    return { ok: true, next, type };
  });
}
