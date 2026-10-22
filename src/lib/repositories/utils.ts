import {
  CALL_TYPES,
  TYPE_PREFIXES,
  MAX_QUEUE_NUMBER,
  USERNAME_REGEX,
  EMAIL_DOMAIN,
  DEFAULT_GUICHE,
  NEWS_ALLOWED_TYPES,
  NEWS_MAX_FILE_SIZE,
  PAGE_SIZES,
  MAX_PAGE_SIZE,
} from "@/lib/constants";
import type { CallType, SequenceType } from "@/lib/constants";

/**
 * Erro com status HTTP para a rota traduzir.
 *
 * É um `Error` de verdade (mantém stack e `instanceof Error`), com o `status`
 * que o handler usa na resposta. Prefira `routeError()` a construir à mão.
 */
export class RouteError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "RouteError";
    this.status = status;
  }
}

export function normalizeCallType(type: string | undefined): {
  sequenceType: SequenceType;
  callType: CallType;
} {
  const isPriority = type === CALL_TYPES.PREFERENTIAL || type === CALL_TYPES.PREFERENCIAL;
  return {
    sequenceType: isPriority ? CALL_TYPES.PREFERENCIAL : CALL_TYPES.NORMAL,
    callType: isPriority ? CALL_TYPES.PREFERENTIAL : CALL_TYPES.NORMAL,
  };
}

/**
 * Normaliza `pageSize` para um inteiro em `1..MAX_PAGE_SIZE`.
 *
 * Ausente/inválido vira o default do histórico (`PAGE_SIZES.historico`).
 * O teto importa: `?pageSize=999999` traria a janela inteira de volta e
 * anularia a paginação no servidor.
 */
export function normalizePageSize(value: number | undefined): number {
  const size = Math.floor(Number(value));
  if (!Number.isFinite(size) || size < 1) return PAGE_SIZES.historico;
  return Math.min(MAX_PAGE_SIZE, size);
}

/**
 * Normaliza `page` para um inteiro >= 1.
 *
 * O clamp superior (`totalPages`) depende do total e fica com quem
 * conhece a contagem — `getStats` clampa antes de montar o `skip`.
 */
export function normalizePage(value: number | undefined): number {
  const page = Math.floor(Number(value));
  return Number.isFinite(page) && page >= 1 ? page : 1;
}

export function formatNumberString(num: number, type: CallType): string {
  const prefix =
    type === CALL_TYPES.PREFERENCIAL || type === CALL_TYPES.PREFERENTIAL
      ? TYPE_PREFIXES.preferencial
      : TYPE_PREFIXES.normal;
  if (Number(num) >= MAX_QUEUE_NUMBER + 1) return String(MAX_QUEUE_NUMBER + 1);
  return `${prefix}${String(Number(num) || 0).padStart(3, "0")}`;
}

export function isValidUsername(username: string): boolean {
  return USERNAME_REGEX.test(username);
}

/**
 * Create typed error with status for the route to translate
 */
export function routeError(status: number, message: string): RouteError {
  return new RouteError(status, message);
}

/**
 * Extracts `error.status` from an unknown catch value, falling back to 500.
 *
 * Use inside `catch (err)` — `err` is `unknown` em TypeScript, então ler
 * `.status` direto não compila.
 */
export function errorStatus(error: unknown, fallback = 500): number {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = error.status;
    if (typeof status === "number" && status) return status;
  }
  return fallback;
}

/**
 * Extracts `error.message` from an unknown catch value.
 */
export function errorMessage(error: unknown, fallback = ""): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = error.message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

/**
 * Extrai `error.code` de um valor capturado em `catch` — é assim que se lê o
 * código do Prisma (P2002 = unique, P2003 = FK, P2025 = registro não achado).
 *
 * @returns o código ou `null` quando não for um erro com `code`
 */
export function errorCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const { code } = error;
    return typeof code === "string" ? code : null;
  }
  return null;
}

/**
 * Generate initials from full name (max 2 chars)
 */
export function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Generate default email for a user
 */
export function generateEmail(username: string): string {
  return `${username}${EMAIL_DOMAIN}`;
}

/**
 * Get default guiche value
 */
export function getDefaultGuiche(): string {
  return DEFAULT_GUICHE;
}

export function isInvalidApiKeyError(error: unknown): boolean {
  const message =
    typeof error === "object" && error !== null && "message" in error ? error.message : undefined;
  // Só entra no regex o que é literalmente texto: `String(obj)` viraria
  // "[object Object]" e nunca casaria de qualquer forma.
  const text =
    typeof message === "string" && message !== ""
      ? message
      : typeof error === "string"
        ? error
        : "";
  return /invalid api key/i.test(text);
}

/**
 * Validate allowed image types
 */
export function isAllowedImageType(type: string): boolean {
  return NEWS_ALLOWED_TYPES.includes(type);
}

/**
 * Validate file size
 */
export function isValidFileSize(size: number): boolean {
  return size <= NEWS_MAX_FILE_SIZE;
}
