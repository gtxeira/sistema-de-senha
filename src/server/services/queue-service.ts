import 'server-only';

import { queue } from '@/server/repositories';
import { eventManager } from '@/server/realtime/event-manager';
import type { QueueCallEvent } from '@/server/realtime/event-manager';
import { routeError } from '@/server/http/errors';
import { formatNumberString, normalizeCallType } from '@/shared/queue-format';
import {
  MAX_QUEUE_NUMBER,
  MIN_QUEUE_NUMBER,
  SECTORS,
} from '@/shared/constants';
import type { SectorId, SequenceType } from '@/shared/constants';
import type { RecentCall } from '@/shared/types/domain';

/**
 * Use cases da fila.
 *
 * A rota cuida de HTTP, autenticação e escopo; aqui ficam as regras que
 * envolvem numeração, persistência e propagação via SSE. Os eventos são
 * emitidos depois da gravação, com o mesmo marcador de reset que o cliente
 * usa para invalidar a réplica local.
 */

export interface CallNextInput {
  readonly sector: SectorId;
  readonly type?: string;
  /** Id do usuário que chamou — o repositório valida o formato/UUID. */
  readonly attendantId: string;
}

export interface CallNextResult {
  readonly number: number;
  readonly numberStr: string;
  readonly type: SequenceType;
  readonly wraparound: boolean;
}

/** Chama a próxima senha de um setor, salva e publica o evento de fila. */
export async function callNext({
  sector,
  type,
  attendantId,
}: CallNextInput): Promise<CallNextResult> {
  const { sequenceType, callType } = normalizeCallType(type);

  const nextResult = await queue.nextNumber(sector, sequenceType);
  const { number } = nextResult;
  const wraparound = nextResult.wraparound || false;
  const numberStr = formatNumberString(number, sequenceType);

  const saved = await queue.saveCall({
    sector,
    number,
    numberStr,
    sequenceType,
    callType,
    attendantId,
  });

  // Emit realtime event for monitors, stamped with the sector's reset marker
  // so clients can tell whether their local replica predates a reset.
  const resetAt = await queue.getSectorResetAt(sector);
  const callEvent: QueueCallEvent = {
    id: saved.id,
    number,
    type: sequenceType,
    wraparound,
    // O instante gravado pelo banco, não "agora": o SSE propaga o
    // registro, e quem formata em BRT é o cliente.
    createdAt: saved.createdAt,
  };
  eventManager.emitQueueCall(
    sector,
    callEvent,
    resetAt ? resetAt.toISOString() : null,
  );

  return { number, numberStr, type: sequenceType, wraparound };
}

/** Repete a última senha do setor e publica o evento de recall. */
export async function recallLast(
  sector: SectorId,
): Promise<{ number: number; type: SequenceType }> {
  const resetAt = await queue.getSectorResetAt(sector);
  // Only calls made after the last reset are repeatable — the rows from
  // before it survive for /historico but no longer belong to the live queue.
  const calls = await queue.getRecentCalls(sector, 1, resetAt);
  if (!calls.length) {
    throw routeError(404, 'Nenhuma senha anterior para repetir.');
  }

  const last = calls[0];
  const callEvent: QueueCallEvent = {
    id: last.id,
    number: last.number,
    type: last.type,
    // O instante da chamada REPETIDA (o mesmo do retrato), não "agora":
    // o SSE descreve a senha, e quem formata em BRT é o cliente.
    createdAt: last.createdAt,
  };

  eventManager.emitQueueRecall(
    sector,
    callEvent,
    resetAt ? resetAt.toISOString() : null,
  );

  return { number: last.number, type: last.type };
}

/** Fila recente + marcador de reset — usado pelo polling dos monitores. */
export async function getRecent(
  sector: SectorId,
  limit: number,
): Promise<{ calls: RecentCall[]; resetAt: string | null }> {
  const resetAt = await queue.getSectorResetAt(sector);
  const calls = await queue.getRecentCalls(sector, limit, resetAt);
  return {
    calls,
    resetAt: resetAt ? resetAt.toISOString() : null,
  };
}

/** Reseta as sequências e publica um evento para cada setor. */
export async function resetSectors(
  sectors: readonly SectorId[],
): Promise<{ sectors: SectorId[] }> {
  // Reset each sector
  await Promise.all(sectors.map((sector) => queue.resetSector(sector)));

  // Notify every connected client. Emitting per sector lets each sector's own
  // stream carry the event, so `sector: "all"` propagates naturally.
  for (const sector of sectors) {
    const resetAt = await queue.getSectorResetAt(sector);
    eventManager.emitQueueReset(sector, resetAt ? resetAt.toISOString() : null);
  }

  return { sectors: [...sectors] };
}

export interface SyncNextInput {
  readonly sector: SectorId;
  readonly type?: string;
  readonly nextNumber: unknown;
}

export interface SyncNextResult {
  readonly sector: SectorId;
  readonly type: SequenceType;
  readonly nextNumber: number;
  readonly numberStr: string;
  readonly message: string;
}

/** Fixa o próximo número da fila de um setor. */
export async function syncNext({
  sector,
  type,
  nextNumber,
}: SyncNextInput): Promise<SyncNextResult> {
  const { sequenceType } = normalizeCallType(type);

  const num = Number(nextNumber);
  if (
    !Number.isInteger(num) ||
    num < MIN_QUEUE_NUMBER ||
    num > MAX_QUEUE_NUMBER
  ) {
    throw routeError(
      400,
      `Número inválido. Use um valor entre ${MIN_QUEUE_NUMBER} e ${MAX_QUEUE_NUMBER}.`,
    );
  }

  await queue.setNextNumber(sector, sequenceType, num);

  const numberStr = formatNumberString(num, sequenceType);

  return {
    sector,
    type: sequenceType,
    nextNumber: num,
    numberStr,
    message: `Próxima senha de ${SECTORS[sector]?.name || sector}: ${numberStr}`,
  };
}
