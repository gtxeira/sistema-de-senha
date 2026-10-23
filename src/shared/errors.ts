/**
 * Leitura tolerante de erros capturados em `catch` — helpers puros, sem
 * dependência de runtime. Vivem em `shared` porque a UI também os usa para
 * extrair a mensagem de uma resposta de API.
 *
 * O `RouteError` (erro com status HTTP) fica em `@/server/http/errors`, que é
 * onde a borda HTTP o traduz.
 */

/**
 * Extracts `error.status` from an unknown catch value, falling back to 500.
 *
 * Use inside `catch (err)` — `err` is `unknown` em TypeScript, então ler
 * `.status` direto não compila.
 */
export function errorStatus(error: unknown, fallback = 500): number {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = error.status;
    if (typeof status === 'number' && status) return status;
  }
  return fallback;
}

/**
 * Extracts `error.message` from an unknown catch value.
 */
export function errorMessage(error: unknown, fallback = ''): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string' && message) return message;
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
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

export function isInvalidApiKeyError(error: unknown): boolean {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? error.message
      : undefined;
  // Só entra no regex o que é literalmente texto: `String(obj)` viraria
  // "[object Object]" e nunca casaria de qualquer forma.
  const text =
    typeof message === 'string' && message !== ''
      ? message
      : typeof error === 'string'
        ? error
        : '';
  return /invalid api key/i.test(text);
}
