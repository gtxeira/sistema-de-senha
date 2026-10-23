import { CALL_TYPES, TYPE_PREFIXES, MAX_QUEUE_NUMBER } from './constants';
import type { CallType, SequenceType } from './constants';

/**
 * Formatação pura de números de senha — usada pelo servidor (respostas das
 * rotas e repositórios) e pelo cliente (display e payloads de SSE).
 */

/**
 * Normaliza o tipo recebido na borda para o par
 * `sequenceType` (banco) / `callType` (wire).
 */
export function normalizeCallType(type: string | undefined): {
  sequenceType: SequenceType;
  callType: CallType;
} {
  const isPriority =
    type === CALL_TYPES.PREFERENTIAL || type === CALL_TYPES.PREFERENCIAL;
  return {
    sequenceType: isPriority ? CALL_TYPES.PREFERENCIAL : CALL_TYPES.NORMAL,
    callType: isPriority ? CALL_TYPES.PREFERENTIAL : CALL_TYPES.NORMAL,
  };
}

/** `N001` / `P002` — prefixo + número com 3 dígitos. */
export function formatNumberString(num: number, type: CallType): string {
  const prefix =
    type === CALL_TYPES.PREFERENCIAL || type === CALL_TYPES.PREFERENTIAL
      ? TYPE_PREFIXES.preferencial
      : TYPE_PREFIXES.normal;
  if (Number(num) >= MAX_QUEUE_NUMBER + 1) return String(MAX_QUEUE_NUMBER + 1);
  return `${prefix}${String(Number(num) || 0).padStart(3, '0')}`;
}

/** Número cru zero-padded, sem prefixo (`001`), com o teto da fila. */
export function formatQueueNumber(num: number | null | undefined): string {
  if (!num || num <= 0) return '---';
  if (num >= MAX_QUEUE_NUMBER + 1) return String(MAX_QUEUE_NUMBER);
  return String(num).padStart(3, '0');
}
