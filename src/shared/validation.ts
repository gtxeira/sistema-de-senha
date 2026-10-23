import {
  MAX_PAGE_SIZE,
  NEWS_ALLOWED_TYPES,
  NEWS_MAX_FILE_SIZE,
  PAGE_SIZES,
  USERNAME_REGEX,
} from './constants';

/**
 * Validações e normalizações puras de entrada — usadas tanto na borda HTTP
 * (rotas e repositórios) quanto na UI, sem dependência de runtime.
 */

/** Valida se o MIME type da imagem está entre os aceitos para notícias. */
export function isAllowedImageType(type: string): boolean {
  return NEWS_ALLOWED_TYPES.includes(type);
}

/** Valida o tamanho da imagem contra o limite de upload. */
export function isValidFileSize(size: number): boolean {
  return size <= NEWS_MAX_FILE_SIZE;
}

export function isValidUsername(username: string): boolean {
  return USERNAME_REGEX.test(username);
}

/**
 * Normaliza `page` para um inteiro >= 1.
 *
 * O clamp superior (`totalPages`) depende do total e fica com quem
 * conhece a contagem — `getStats` clampa antes de montar o `skip`.
 */
export function normalizePage(value: undefined | number): number {
  const page = Math.floor(Number(value));
  return Number.isFinite(page) && page >= 1 ? page : 1;
}

/**
 * Normaliza `pageSize` para um inteiro em `1..MAX_PAGE_SIZE`.
 *
 * Ausente/inválido vira o default do histórico (`PAGE_SIZES.historico`).
 * O teto importa: `?pageSize=999999` traria a janela inteira de volta e
 * anularia a paginação no servidor.
 */
export function normalizePageSize(value: undefined | number): number {
  const size = Math.floor(Number(value));
  if (!Number.isFinite(size) || size < 1) return PAGE_SIZES.historico;
  return Math.min(MAX_PAGE_SIZE, size);
}
